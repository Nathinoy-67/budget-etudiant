import type { Category, ID, ISODate, Recurring, Settings, Transaction } from '../types';
import { db, uid } from './db';
import { buildDefaultAccounts, buildDefaultCategories, defaultSettings } from './defaults';
import { addDays, todayISO } from '../lib/dates';
import { occurrencesBetween, pendingOccurrences } from '../lib/recurrence';
import { TABLE_NAMES, makeBackup, type BackupData, type BackupFile } from '../lib/backup';

// ---------- Initialisation ----------

/** Crée les réglages, catégories, comptes et raccourcis par défaut au premier lancement. */
export async function ensureInitialized(): Promise<void> {
  await db.transaction('rw', [db.settings, db.categories, db.accounts], async () => {
    const existing = await db.settings.get('main');
    if (existing) return;
    const categories = buildDefaultCategories();
    const accounts = buildDefaultAccounts();
    await db.categories.bulkAdd(categories);
    await db.accounts.bulkAdd(accounts);
    await db.settings.add({ ...defaultSettings(), defaultAccountId: accounts[0].id });
  });
}

/**
 * Simplification « un seul compte » : les comptes secondaires vides (Livret A, Espèces créés
 * par défaut autrefois) sont supprimés ; ceux qui ont des opérations sont archivés (rien n'est perdu).
 */
export async function simplifyToSingleAccount(): Promise<void> {
  await db.transaction('rw', [db.accounts, db.transactions, db.settings], async () => {
    const settings = await db.settings.get('main');
    const accounts = await db.accounts.toArray();
    if (!settings || accounts.length <= 1) return;
    const main = accounts.find((a) => a.id === settings.defaultAccountId) ?? accounts.find((a) => a.type === 'courant') ?? accounts[0];
    if (settings.defaultAccountId !== main.id) await db.settings.update('main', { defaultAccountId: main.id });
    for (const a of accounts) {
      if (a.id === main.id) continue;
      const used = (await db.transactions.where('accountId').equals(a.id).count()) + (await db.transactions.filter((t) => t.toAccountId === a.id).count());
      if (used) await db.accounts.update(a.id, { archived: true });
      else await db.accounts.delete(a.id);
    }
  });
}

/** Demande au navigateur de ne pas effacer les données (réduit le risque de purge sur iOS). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---------- Réglages ----------

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update('main', patch);
}

// ---------- Transactions ----------

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export async function addTransaction(t: NewTransaction & { id?: ID; createdAt?: number }): Promise<Transaction> {
  const now = Date.now();
  const full: Transaction = { ...t, id: t.id ?? uid(), createdAt: t.createdAt ?? now, updatedAt: now };
  await db.transactions.add(full);
  return full;
}

export async function updateTransaction(id: ID, patch: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteTransaction(id: ID): Promise<Transaction | undefined> {
  const t = await db.transactions.get(id);
  if (t) await db.transactions.delete(id);
  return t;
}

export async function restoreTransactions(ts: Transaction[]): Promise<void> {
  await db.transactions.bulkPut(ts);
}

/**
 * Ajoute un paiement reçu automatiquement (Apple Pay). S'il correspond à une échéance d'abonnement
 * ou de charge fixe (même montant, à 3 jours près), il prend la place de cette échéance au lieu de
 * s'y ajouter : l'abonnement n'est jamais compté deux fois.
 */
export async function addPaymentMatchingRecurring(t: NewTransaction & { id?: ID; createdAt?: number }): Promise<Transaction> {
  return db.transaction('rw', [db.recurrings, db.transactions], async () => {
    const recs = (await db.recurrings.toArray()).filter((r) => r.active && r.type === t.type && r.amount === t.amount);
    for (const r of recs) {
      for (const occurrence of occurrencesBetween(r, addDays(t.date, -3), addDays(t.date, 3))) {
        const generated = await db.transactions.where('[recurringId+occurrence]').equals([r.id, occurrence]).first();
        if (generated?.source) continue; // échéance déjà rapprochée d'un vrai paiement
        if (generated) await db.transactions.delete(generated.id);
        return addTransaction({ ...t, recurringId: r.id, occurrence, categoryId: generated?.categoryId ?? r.categoryId ?? t.categoryId, note: r.name });
      }
    }
    return addTransaction(t);
  });
}

/**
 * Transforme une opération existante en abonnement (ou revenu régulier) : crée la récurrence
 * à partir de sa date et rattache l'opération à cette première échéance (pas de doublon).
 */
export async function makeRecurringFrom(
  tx: Transaction,
  opts: { frequency: Recurring['frequency']; name: string; emoji?: string },
): Promise<Recurring> {
  const full: Recurring = {
    name: opts.name,
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.categoryId,
    accountId: tx.accountId,
    toAccountId: null,
    frequency: opts.frequency,
    interval: 1,
    startDate: tx.date,
    endDate: null,
    skipped: [],
    lastGenerated: tx.date,
    active: true,
    isSubscription: tx.type === 'expense',
    remindDaysBefore: 0,
    emoji: opts.emoji,
    id: uid(),
    createdAt: Date.now(),
  };
  await db.transaction('rw', [db.recurrings, db.transactions], async () => {
    await db.recurrings.add(full);
    await db.transactions.update(tx.id, { recurringId: full.id, occurrence: tx.date, updatedAt: Date.now() });
  });
  await generateDueRecurring();
  return full;
}

/** Arrête un abonnement : plus aucune échéance après aujourd'hui (l'historique est conservé). */
export async function stopRecurring(id: ID, today: ISODate = todayISO()): Promise<void> {
  await db.recurrings.update(id, { endDate: today });
}

// ---------- Opérations récurrentes ----------

/**
 * Génère les transactions des échéances arrivées à terme (jusqu'à aujourd'hui inclus).
 * Idempotent : l'index [recurringId+occurrence] empêche les doublons, même avec deux onglets ouverts.
 */
export async function generateDueRecurring(today: ISODate = todayISO()): Promise<number> {
  let created = 0;
  await db.transaction('rw', [db.recurrings, db.transactions], async () => {
    const recs = await db.recurrings.toArray();
    for (const r of recs) {
      if (!r.active) continue;
      const dates = pendingOccurrences(r, today);
      for (const d of dates) {
        const exists = await db.transactions.where('[recurringId+occurrence]').equals([r.id, d]).count();
        if (exists) continue;
        const now = Date.now();
        await db.transactions.add({
          id: uid(),
          type: r.type,
          amount: r.amount,
          date: d,
          categoryId: r.categoryId,
          accountId: r.accountId,
          toAccountId: r.type === 'transfer' ? (r.toAccountId ?? null) : null,
          note: r.name,
          recurringId: r.id,
          occurrence: d,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
      if (r.startDate <= today && (r.lastGenerated ?? '') < today) {
        await db.recurrings.update(r.id, { lastGenerated: today });
      }
    }
  });
  return created;
}

export type NewRecurring = Omit<Recurring, 'id' | 'createdAt' | 'skipped' | 'lastGenerated'> &
  Partial<Pick<Recurring, 'skipped' | 'lastGenerated'>>;

export async function addRecurring(r: NewRecurring): Promise<Recurring> {
  const full: Recurring = { skipped: [], lastGenerated: null, ...r, id: uid(), createdAt: Date.now() };
  await db.recurrings.add(full);
  await generateDueRecurring();
  return full;
}

export async function updateRecurring(id: ID, patch: Partial<Recurring>): Promise<void> {
  const before = await db.recurrings.get(id);
  if (!before) return;
  const next: Partial<Recurring> = { ...patch };
  // Reprise après une pause : on ne rattrape pas les échéances de la période de pause
  if (patch.active === true && !before.active) next.lastGenerated = addDays(todayISO(), -1);
  await db.recurrings.update(id, next);
  await generateDueRecurring();
}

/** Supprime une récurrence ; les transactions déjà passées sont conservées par défaut. */
export async function deleteRecurring(id: ID, deleteTransactions = false): Promise<void> {
  await db.transaction('rw', [db.recurrings, db.transactions], async () => {
    await db.recurrings.delete(id);
    if (deleteTransactions) await db.transactions.where('recurringId').equals(id).delete();
    else await db.transactions.where('recurringId').equals(id).modify({ recurringId: null });
  });
}

/** Saute une échéance (et supprime sa transaction si elle a déjà été générée). */
export async function skipOccurrence(id: ID, date: ISODate): Promise<void> {
  await db.transaction('rw', [db.recurrings, db.transactions], async () => {
    const r = await db.recurrings.get(id);
    if (!r) return;
    if (!r.skipped.includes(date)) await db.recurrings.update(id, { skipped: [...r.skipped, date].sort() });
    await db.transactions.where('[recurringId+occurrence]').equals([id, date]).delete();
  });
}

/** Rétablit une échéance sautée (et la génère si elle est déjà passée). */
export async function unskipOccurrence(id: ID, date: ISODate): Promise<void> {
  await db.transaction('rw', [db.recurrings, db.transactions], async () => {
    const r = await db.recurrings.get(id);
    if (!r) return;
    await db.recurrings.update(id, { skipped: r.skipped.filter((d) => d !== date) });
    // Échéance déjà dépassée par la génération automatique : on crée sa transaction maintenant
    const alreadyPassed = r.lastGenerated != null && date <= r.lastGenerated;
    const exists = await db.transactions.where('[recurringId+occurrence]').equals([id, date]).count();
    if (alreadyPassed && !exists) {
      const now = Date.now();
      await db.transactions.add({
        id: uid(),
        type: r.type,
        amount: r.amount,
        date,
        categoryId: r.categoryId,
        accountId: r.accountId,
        toAccountId: r.type === 'transfer' ? (r.toAccountId ?? null) : null,
        note: r.name,
        recurringId: r.id,
        occurrence: date,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

// ---------- Catégories ----------

export async function saveCategory(c: Omit<Category, 'id' | 'order'> & { id?: ID }): Promise<void> {
  if (c.id) {
    await db.categories.update(c.id, c);
    return;
  }
  const order = await db.categories.where('kind').equals(c.kind).count();
  await db.categories.add({ ...c, id: uid(), order });
}

export async function removeCategory(id: ID): Promise<'deleted' | 'archived'> {
  const used = await db.transactions.where('categoryId').equals(id).count();
  if (used > 0) {
    await db.categories.update(id, { archived: true });
    return 'archived';
  }
  await db.categories.delete(id);
  return 'deleted';
}

export async function setCategoryBudget(id: ID, budget: number | null): Promise<void> {
  await db.categories.update(id, { budget });
}

export async function reorderCategories(ids: ID[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(ids.map((id, order) => db.categories.update(id, { order })));
  });
}

// ---------- Sauvegarde / import / réinitialisation ----------

const allTables = () => TABLE_NAMES.map((n) => db.table(n));

export async function exportAll(): Promise<BackupFile> {
  const data = {} as BackupData;
  for (const name of TABLE_NAMES) (data as unknown as Record<string, unknown[]>)[name] = await db.table(name).toArray();
  return makeBackup(data);
}

export async function importAll(backup: BackupFile): Promise<void> {
  await db.transaction('rw', allTables(), async () => {
    for (const name of TABLE_NAMES) {
      await db.table(name).clear();
      const rows = (backup.data as unknown as Record<string, unknown[]>)[name] ?? [];
      if (rows.length) await db.table(name).bulkAdd(rows);
    }
    // une sauvegarde sans réglages (ou d'une autre version) reste utilisable
    const s = await db.settings.get('main');
    if (!s) await db.settings.add({ ...defaultSettings(), onboarded: true });
    // une sauvegarde restaurée devient les vraies données (même si elle a été faite pendant l'essai de l'exemple)
    else await db.settings.put({ ...defaultSettings(), ...s, notified: s.notified ?? [], demoMode: false });
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', allTables(), async () => {
    for (const t of allTables()) await t.clear();
  });
}

/** Efface vraiment tout, y compris les données mises de côté pendant l'essai des données exemple. */
export async function eraseEverything(): Promise<void> {
  await resetAll();
  await db.vault.clear();
  try {
    localStorage.removeItem('be-theme');
  } catch {
    /* rien */
  }
}
