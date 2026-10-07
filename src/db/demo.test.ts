import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { loadDemoData } from './demo';
import { generateDueRecurring, skipOccurrence, unskipOccurrence, addRecurring, deleteTransaction, ensureInitialized, resetAll } from './actions';
import { todayISO } from '../lib/dates';

describe('données de démonstration', () => {
  it('chargent des dépenses variables, récurrences, objectifs et colocation', async () => {
    await loadDemoData();
    const txs = await db.transactions.toArray();
    const variable = txs.filter((t) => t.type === 'expense' && !t.recurringId);
    const recurringTx = txs.filter((t) => t.recurringId);
    expect(variable.length).toBeGreaterThan(50);
    expect(recurringTx.length).toBeGreaterThan(10);
    expect(await db.goals.count()).toBe(3);
    expect(await db.groups.count()).toBe(1);
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
