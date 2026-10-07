import type {
  Account,
  Category,
  Goal,
  GoalContribution,
  ID,
  ISODate,
  QuickAdd,
  Recurring,
  Settings,
  SharedExpense,
  SharedGroup,
  Transaction,
} from '../types';
import { db, uid } from './db';
import { buildDefaultAccounts, buildDefaultCategories, buildDefaultQuickAdds, defaultSettings } from './defaults';
import { addDays, todayISO } from '../lib/dates';
import { pendingOccurrences } from '../lib/recurrence';
import { TABLE_NAMES, makeBackup, type BackupData, type BackupFile } from '../lib/backup';

// ---------- Initialisation ----------

/** Crée les réglages, catégories, comptes et raccourcis par défaut au premier lancement. */
export async function ensureInitialized(): Promise<void> {
  await db.transaction('rw', [db.settings, db.categories, db.accounts, db.quickAdds], async () => {
    const existing = await db.settings.get('main');
    if (existing) return;
    const categories = buildDefaultCategories();
    const accounts = buildDefaultAccounts();
    await db.categories.bulkAdd(categories);
    await db.accounts.bulkAdd(accounts);
    await db.quickAdds.bulkAdd(buildDefaultQuickAdds(categories));
    await db.settings.add({ ...defaultSettings(), defaultAccountId: accounts[0].id });
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

export async function addTransaction(t: NewTransaction): Promise<Transaction> {
  const now = Date.now();
  const full: Transaction = { ...t, id: uid(), createdAt: now, updatedAt: now };
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

// ---------- Comptes ----------

export async function saveAccount(a: Omit<Account, 'id' | 'createdAt' | 'order'> & { id?: ID }): Promise<void> {
  if (a.id) {
    await db.accounts.update(a.id, a);
    return;
  }
  const order = await db.accounts.count();
  await db.accounts.add({ ...a, id: uid(), order, createdAt: Date.now() });
}

/** Supprime le compte s'il est vide, sinon l'archive. Retourne l'action effectuée. */
export async function removeAccount(id: ID): Promise<'deleted' | 'archived'> {
  const used =
    (await db.transactions.where('accountId').equals(id).count()) +
    (await db.transactions.filter((t) => t.toAccountId === id).count());
  if (used > 0) {
    await db.accounts.update(id, { archived: true });
    return 'archived';
  }
  await db.accounts.delete(id);
  return 'deleted';
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

// ---------- Objectifs ----------

export async function saveGoal(g: Omit<Goal, 'id' | 'createdAt'> & { id?: ID }): Promise<ID> {
  if (g.id) {
    await db.goals.update(g.id, g);
    return g.id;
  }
  const id = uid();
  await db.goals.add({ ...g, id, createdAt: Date.now() });
  return id;
}

export async function deleteGoal(id: ID): Promise<void> {
  await db.transaction('rw', [db.goals, db.contributions], async () => {
    await db.goals.delete(id);
    await db.contributions.where('goalId').equals(id).delete();
  });
}

export async function addContribution(c: Omit<GoalContribution, 'id' | 'createdAt'>): Promise<void> {
  await db.contributions.add({ ...c, id: uid(), createdAt: Date.now() });
}

export async function deleteContribution(id: ID): Promise<void> {
  await db.contributions.delete(id);
}

// ---------- Dépenses partagées ----------

export async function saveGroup(g: Omit<SharedGroup, 'id' | 'createdAt'> & { id?: ID }): Promise<ID> {
  if (g.id) {
    await db.groups.update(g.id, g);
    return g.id;
  }
  const id = uid();
  await db.groups.add({ ...g, id, createdAt: Date.now() });
  return id;
}

export async function deleteGroup(id: ID): Promise<void> {
  await db.transaction('rw', [db.groups, db.sharedExpenses], async () => {
    await db.groups.delete(id);
    await db.sharedExpenses.where('groupId').equals(id).delete();
  });
}

export async function saveSharedExpense(e: Omit<SharedExpense, 'id' | 'createdAt'> & { id?: ID }): Promise<void> {
  if (e.id) {
    await db.sharedExpenses.update(e.id, e);
    return;
  }
  await db.sharedExpenses.add({ ...e, id: uid(), createdAt: Date.now() });
}

export async function deleteSharedExpense(id: ID): Promise<void> {
  await db.sharedExpenses.delete(id);
}

// ---------- Raccourcis ----------

export async function saveQuickAdd(q: Omit<QuickAdd, 'id' | 'order'> & { id?: ID }): Promise<void> {
  if (q.id) {
    await db.quickAdds.update(q.id, q);
    return;
  }
  const order = await db.quickAdds.count();
  await db.quickAdds.add({ ...q, id: uid(), order });
}

export async function deleteQuickAdd(id: ID): Promise<void> {
  await db.quickAdds.delete(id);
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
    else await db.settings.put({ ...defaultSettings(), ...s, notified: s.notified ?? [] });
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', allTables(), async () => {
    for (const t of allTables()) await t.clear();
  });
  try {
    localStorage.removeItem('be-theme');
  } catch {
    /* rien */
  }
}
