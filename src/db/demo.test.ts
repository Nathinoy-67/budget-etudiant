import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { exitDemoMode, loadDemoData, startDemoMode } from './demo';
import {
  addPaymentMatchingRecurring,
  addRecurring,
  addTransaction,
  deleteTransaction,
  ensureInitialized,
  eraseEverything,
  generateDueRecurring,
  makeRecurringFrom,
  resetAll,
  simplifyToSingleAccount,
  skipOccurrence,
  stopRecurring,
  unskipOccurrence,
  updateSettings,
} from './actions';
import { todayISO } from '../lib/dates';

describe('données de démonstration', () => {
  it('chargent des dépenses variables et des récurrences sur un seul compte', async () => {
    await loadDemoData();
    const txs = await db.transactions.toArray();
    const variable = txs.filter((t) => t.type === 'expense' && !t.recurringId);
    const recurringTx = txs.filter((t) => t.recurringId);
    expect(variable.length).toBeGreaterThan(50);
    expect(recurringTx.length).toBeGreaterThan(10);
    expect(await db.accounts.count()).toBe(1);
    expect(txs.some((t) => t.type === 'transfer')).toBe(false);
    expect(await db.quickAdds.count()).toBe(0);
    expect((await db.settings.get('main'))?.onboarded).toBe(true);
    // aucune opération dans le futur
    expect(txs.every((t) => t.date <= todayISO())).toBe(true);
  });
});

describe('génération des récurrences (IndexedDB)', () => {
  it('est idempotente, ne recrée pas une échéance supprimée, et gère sauter/rétablir', async () => {
    await resetAll();
    await ensureInitialized();
    const account = (await db.accounts.toArray())[0];
    const r = await addRecurring({
      name: 'Loyer',
      type: 'expense',
      amount: 45000,
      categoryId: null,
      accountId: account.id,
      toAccountId: null,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-07-05',
      endDate: null,
      active: true,
      isSubscription: false,
      remindDaysBefore: 2,
    });
    const today = todayISO();
    const count = () => db.transactions.where('recurringId').equals(r.id).count();
    const first = await count();
    expect(first).toBeGreaterThanOrEqual(3);
    expect(await generateDueRecurring(today)).toBe(0);
    expect(await count()).toBe(first);

    // suppression manuelle : pas de recréation
    const one = await db.transactions.where('[recurringId+occurrence]').equals([r.id, '2026-08-05']).first();
    await deleteTransaction(one!.id);
    await generateDueRecurring(today);
    expect(await count()).toBe(first - 1);

    // sauter puis rétablir
    await skipOccurrence(r.id, '2026-09-05');
    expect(await count()).toBe(first - 2);
    expect((await db.recurrings.get(r.id))!.skipped).toContain('2026-09-05');
    await unskipOccurrence(r.id, '2026-09-05');
    expect(await count()).toBe(first - 1);
  });
});

describe('passage à un seul compte', () => {
  it('supprime les comptes secondaires vides et archive ceux qui ont des opérations', async () => {
    await resetAll();
    await ensureInitialized();
    const [main] = await db.accounts.toArray();
    await db.accounts.bulkAdd([
      { id: 'livret', name: 'Livret A', type: 'livret', emoji: '🏦', color: '#000', initialBalance: 0, order: 1, createdAt: 0 },
      { id: 'especes', name: 'Espèces', type: 'especes', emoji: '💵', color: '#000', initialBalance: 0, order: 2, createdAt: 0 },
    ]);
    await db.transactions.add({ id: 't1', type: 'expense', amount: 500, date: '2026-10-01', categoryId: null, accountId: 'especes', note: '', createdAt: 0, updatedAt: 0 });
    await simplifyToSingleAccount();
    const accounts = await db.accounts.toArray();
    expect(accounts.map((a) => a.id).sort()).toEqual([main.id, 'especes'].sort());
    expect(accounts.find((a) => a.id === 'especes')?.archived).toBe(true);
    expect(await db.transactions.count()).toBe(1);
    expect((await db.settings.get('main'))?.defaultAccountId).toBe(main.id);
  });
});

describe('essai des données exemple', () => {
  it('met les vraies données de côté puis les restaure à l’identique', async () => {
    await eraseEverything();
    await ensureInitialized();
    await updateSettings({ onboarded: true, relayKey: 'cle-secrete', keepAtEnd: 2000 });
    const [account] = await db.accounts.toArray();
    await db.transactions.add({ id: 'vraie', type: 'expense', amount: 1234, date: '2026-10-02', categoryId: null, accountId: account.id, note: 'Vraie', createdAt: 0, updatedAt: 0 });

    await startDemoMode();
    expect(await db.transactions.get('vraie')).toBeUndefined();
    expect((await db.settings.get('main'))?.demoMode).toBe(true);
    expect((await db.settings.get('main'))?.relayKey).toBeFalsy(); // relais Apple Pay coupé pendant l'essai
    // recharger l'exemple ne doit pas écraser la copie des vraies données
    await startDemoMode();

    expect(await exitDemoMode()).toBe(true);
    const s = await db.settings.get('main');
    expect(await db.transactions.count()).toBe(1);
    expect((await db.transactions.get('vraie'))?.amount).toBe(1234);
    expect(s?.relayKey).toBe('cle-secrete');
    expect(s?.keepAtEnd).toBe(2000);
    expect(s?.demoMode).toBe(false);
    expect(await db.vault.count()).toBe(0);
    expect(await exitDemoMode()).toBe(false);
  });
});

describe('abonnements', () => {
  const base = async () => {
    await eraseEverything();
    await ensureInitialized();
    return (await db.accounts.toArray())[0];
  };

  it('une opération marquée « abonnement » devient la 1re échéance, sans doublon', async () => {
    const account = await base();
    const tx = await addTransaction({ type: 'expense', amount: 799, date: '2026-08-18', categoryId: null, accountId: account.id, note: 'Netflix', recurringId: null, occurrence: null });
    const r = await makeRecurringFrom(tx, { frequency: 'monthly', name: 'Netflix' });
    expect(r.isSubscription).toBe(true);
    const linked = await db.transactions.where('recurringId').equals(r.id).toArray();
    expect(linked.filter((t) => t.date === '2026-08-18')).toHaveLength(1);
    expect(linked.some((t) => t.date === '2026-09-18')).toBe(true);

    await stopRecurring(r.id, '2026-09-20');
    const before = await db.transactions.count();
    await generateDueRecurring('2026-12-31');
    expect(await db.transactions.count()).toBe(before);
  });

  it('un paiement Apple Pay remplace l’échéance de l’abonnement au lieu de s’y ajouter', async () => {
    const account = await base();
    const today = todayISO();
    const r = await addRecurring({
      name: 'Spotify', type: 'expense', amount: 599, categoryId: null, accountId: account.id, toAccountId: null,
      frequency: 'monthly', interval: 1, startDate: today, endDate: null, active: true, isSubscription: true, remindDaysBefore: 0,
    });
    expect(await db.transactions.where('recurringId').equals(r.id).count()).toBe(1);
    const pay = await addPaymentMatchingRecurring({ id: 'relay-1', type: 'expense', amount: 599, date: today, categoryId: null, accountId: account.id, note: 'SPOTIFY', recurringId: null, occurrence: null, source: 'applepay' });
    expect(pay.recurringId).toBe(r.id);
    expect(await db.transactions.where('recurringId').equals(r.id).count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
    // autre montant : simple dépense
    const other = await addPaymentMatchingRecurring({ type: 'expense', amount: 450, date: today, categoryId: null, accountId: account.id, note: 'Boulangerie', recurringId: null, occurrence: null, source: 'applepay' });
    expect(other.recurringId).toBeNull();
  });
});
