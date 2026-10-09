import { describe, expect, it } from 'vitest';
import type { Account, Category, Recurring, Transaction } from '../types';
import { accountBalances, budgetLevel, categoryBudgets, computeSummary, crossedLevel, incomeBySource } from './budget';
import { getPeriod } from './dates';

let seq = 0;
function tx(p: Partial<Transaction>): Transaction {
  return {
    id: `t${seq++}`,
    type: 'expense',
    amount: 0,
    date: '2026-10-01',
    categoryId: null,
    accountId: 'a1',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}
function rec(p: Partial<Recurring>): Recurring {
  return {
    id: `r${seq++}`,
    name: 'R',
    type: 'expense',
    amount: 0,
    categoryId: null,
    accountId: 'a1',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-09-01',
    endDate: null,
    skipped: [],
    lastGenerated: null,
    active: true,
    isSubscription: false,
    remindDaysBefore: 2,
    createdAt: 0,
    ...p,
  };
}

describe('computeSummary', () => {
  const period = getPeriod('2026-10-07'); // 1er → 31 oct.
  const today = '2026-10-07';

  // Revenus : job 600 € reçu le 1er, APL 200 € attendue le 25
  const job = rec({ type: 'income', amount: 60000, startDate: '2026-09-01', lastGenerated: '2026-10-01' });
  const apl = rec({ type: 'income', amount: 20000, startDate: '2026-09-25', lastGenerated: '2026-09-25' });
  // Charges fixes : loyer 450 € payé le 5, Spotify 11,99 € le 20
  const loyer = rec({ amount: 45000, startDate: '2026-09-05', lastGenerated: '2026-10-05' });
  const spotify = rec({ amount: 1199, startDate: '2026-09-20', lastGenerated: '2026-09-20' });

  const transactions = [
    tx({ type: 'income', amount: 60000, date: '2026-10-01', recurringId: job.id }),
    tx({ amount: 45000, date: '2026-10-05', recurringId: loyer.id }),
    tx({ amount: 2350, date: '2026-10-03' }), // courses
    tx({ amount: 850, date: '2026-10-07' }), // resto aujourd'hui
    tx({ amount: 400, date: '2026-10-07' }), // café aujourd'hui
    tx({ type: 'transfer', amount: 5000, date: '2026-10-02', toAccountId: 'a2' }), // neutre
    tx({ amount: 9999, date: '2026-09-30' }), // hors période
  ];

  const s = computeSummary(transactions, [job, apl, loyer, spotify], period, today);

  it('sépare revenus reçus et attendus', () => {
    expect(s.income).toBe(60000);
    expect(s.plannedIncome).toBe(20000);
  });
  it('sépare charges fixes payées et à venir', () => {
    expect(s.fixedPaid).toBe(45000);
    expect(s.fixedUpcoming).toBe(1199);
  });
  it('dépenses variables et du jour (virements ignorés)', () => {
    expect(s.variableSpent).toBe(3600);
    expect(s.todaySpent).toBe(1250);
    expect(s.totalSpent).toBe(48600);
    expect(s.balance).toBe(60000 - 48600);
  });
  it('reste à vivre = revenus − charges fixes − dépenses', () => {
    expect(s.resteAVivre).toBe(80000 - 46199 - 3600);
  });
  it('jours écoulés et restants (aujourd’hui inclus)', () => {
    expect(s.daysTotal).toBe(31);
    expect(s.daysElapsed).toBe(7);
    expect(s.daysLeft).toBe(25);
  });
  it('somme à garder en fin de mois déduite du reste à vivre', () => {
    const k = computeSummary(transactions, [job, apl, loyer, spotify], period, today, 2000);
    expect(k.keepAtEnd).toBe(2000);
    expect(k.resteAVivre).toBe(80000 - 46199 - 3600 - 2000);
    expect(k.engagedPct).toBeCloseTo(((46199 + 3600) / (80000 - 2000)) * 100);
  });
  it('un gros achat ne compte qu’une fois (aucune extrapolation)', () => {
    const big = computeSummary([tx({ amount: 15000, date: '2026-10-02' })], [], period, today);
    expect(big.resteAVivre).toBe(-15000);
    expect(big.variableSpent).toBe(15000);
  });
  it('un abonnement pas encore prélevé réduit déjà le reste à vivre', () => {
    const income = rec({ type: 'income', amount: 20000, startDate: '2026-10-01', lastGenerated: '2026-10-07' });
    const sub = rec({ amount: 799, startDate: '2026-10-18', lastGenerated: null, isSubscription: true });
    const r = computeSummary([tx({ type: 'income', amount: 20000, date: '2026-10-01', recurringId: income.id })], [income, sub], period, today);
    expect(r.resteAVivre).toBe(20000 - 799);
  });
  it('liste les échéances à venir triées', () => {
    expect(s.upcoming.map((u) => u.date)).toEqual(['2026-10-20', '2026-10-25']);
  });
  it('ignore les échéances sautées et les récurrences en pause', () => {
    const s2 = computeSummary([], [{ ...spotify, skipped: ['2026-10-20'] }, { ...apl, active: false }], period, today);
    expect(s2.fixedUpcoming).toBe(0);
    expect(s2.plannedIncome).toBe(0);
  });
  it('compte les échéances passées pas encore générées', () => {
    const late = rec({ amount: 1000, startDate: '2026-10-02', lastGenerated: null });
    expect(computeSummary([], [late], period, today).fixedUpcoming).toBe(1000);
  });
  it('données vides : tout à zéro, pas de NaN', () => {
    const e = computeSummary([], [], period, today);
    expect(e.resteAVivre).toBe(0);
    expect(e.engagedPct).toBe(0);
    expect(Number.isNaN(e.engagedPct)).toBe(false);
  });
  it('dépenses sans revenus : 100 % engagé', () => {
    const e = computeSummary([tx({ amount: 100000, date: '2026-10-02' })], [], period, today);
    expect(e.resteAVivre).toBe(-100000);
    expect(e.engagedPct).toBe(100);
  });
  it('période passée : 0 jour restant', () => {
    const past = computeSummary([], [], getPeriod('2026-09-10'), today);
    expect(past.daysLeft).toBe(0);
    expect(past.daysElapsed).toBe(30);
  });
  it('dernier jour du mois : 1 jour restant', () => {
    const last = computeSummary([], [], period, '2026-10-31');
    expect(last.daysLeft).toBe(1);
  });
});

describe('categoryBudgets', () => {
  const cats: Category[] = [
    { id: 'c1', name: 'Restau', emoji: '🍔', color: '#f00', kind: 'expense', budget: 5000, order: 0 },
    { id: 'c2', name: 'Courses', emoji: '🛒', color: '#0f0', kind: 'expense', budget: 15000, order: 1 },
    { id: 'c3', name: 'Loisirs', emoji: '🎮', color: '#00f', kind: 'expense', budget: null, order: 2 },
  ];
  const txs = [
    tx({ categoryId: 'c1', amount: 4200, date: '2026-10-03' }),
    tx({ categoryId: 'c2', amount: 16000, date: '2026-10-04' }),
    tx({ categoryId: 'c3', amount: 3000, date: '2026-10-04' }),
  ];
  const res = categoryBudgets(cats, txs, getPeriod('2026-10-07'));
  it('ne garde que les catégories avec plafond, triées par %', () => {
    expect(res.map((r) => r.category.id)).toEqual(['c2', 'c1']);
  });
  it('alertes à 80 % et 100 %', () => {
    expect(res[0].level).toBe('over');
    expect(res[1].level).toBe('warn');
    expect(res[0].remaining).toBe(-1000);
    expect(budgetLevel(79.9)).toBe('ok');
    expect(budgetLevel(80)).toBe('warn');
    expect(budgetLevel(100)).toBe('over');
  });
});

describe('accountBalances', () => {
  const accounts: Account[] = [
    { id: 'a1', name: 'Courant', type: 'courant', emoji: '💳', color: '#000', initialBalance: 10000, order: 0, createdAt: 0 },
    { id: 'a2', name: 'Livret A', type: 'livret', emoji: '🏦', color: '#000', initialBalance: 50000, order: 1, createdAt: 0 },
  ];
  it('applique revenus, dépenses et virements', () => {
    const b = accountBalances(accounts, [
      tx({ type: 'income', amount: 20000 }),
      tx({ amount: 3000 }),
      tx({ type: 'transfer', amount: 5000, toAccountId: 'a2' }),
    ]);
    expect(b.get('a1')).toBe(10000 + 20000 - 3000 - 5000);
    expect(b.get('a2')).toBe(55000);
  });
  it('ignore les opérations futures si une date est donnée', () => {
    const b = accountBalances(accounts, [tx({ amount: 3000, date: '2026-12-01' })], '2026-10-07');
    expect(b.get('a1')).toBe(10000);
  });
});

describe('incomeBySource', () => {
  it('regroupe les revenus par source', () => {
    const cats: Category[] = [
      { id: 'i1', name: 'Job', emoji: '💼', color: '#000', kind: 'income', budget: null, incomeSource: 'job', order: 0 },
      { id: 'i2', name: 'APL', emoji: '🏠', color: '#000', kind: 'income', budget: null, incomeSource: 'aide', order: 1 },
    ];
    const res = incomeBySource(
      [
        tx({ type: 'income', amount: 50000, categoryId: 'i1' }),
        tx({ type: 'income', amount: 20000, categoryId: 'i2' }),
        tx({ type: 'income', amount: 1000, categoryId: null }),
      ],
      cats,
      getPeriod('2026-10-07'),
    );
    expect(res).toEqual({ job: 50000, aide: 20000, autre: 1000 });
  });
});

describe('crossedLevel', () => {
  it('détecte le passage des seuils une seule fois', () => {
    expect(crossedLevel(7000, 8000, 10000)).toBe('warn');
    expect(crossedLevel(8000, 9000, 10000)).toBeNull();
    expect(crossedLevel(9000, 10000, 10000)).toBe('over');
    expect(crossedLevel(5000, 12000, 10000)).toBe('over');
    expect(crossedLevel(11000, 12000, 10000)).toBeNull();
    expect(crossedLevel(0, 100, 0)).toBeNull();
  });
});
