import { describe, expect, it } from 'vitest';
import type { Account, Category, Transaction } from '../types';
import { averageMonthlyByCategory, goalImpact, reductionFromPercent, simulate } from './simulator';
import { transactionsToCSV } from './csv';
import { makeBackup, validateBackup, type BackupData } from './backup';
import { buildIcs } from './ics';
import { balanceSeries, compareWithPrevious, cumulativeSpending, periodHistory, topExpenses } from './stats';
import { getPeriod, shiftPeriod } from './dates';

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  type: 'expense',
  amount: 0,
  date: '2026-10-01',
  categoryId: null,
  accountId: 'a1',
  note: '',
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

describe('simulateur « et si ? »', () => {
  it('30 € de moins par mois en restos = 360 € par an', () => {
    const r = simulate([{ monthly: 3000 }], 12);
    expect(r.yearly).toBe(36000);
    expect(r.total).toBe(36000);
    expect(r.series[5].cumulative).toBe(18000);
  });
  it('cumule plusieurs ajustements', () => {
    expect(simulate([{ monthly: 3000 }, { monthly: 1199 }], 24).total).toBe(4199 * 24);
  });
  it('réduction en pourcentage', () => {
    expect(reductionFromPercent(12000, 25)).toBe(3000);
    expect(reductionFromPercent(12000, 150)).toBe(12000);
  });
  it("impact sur un objectif d'épargne", () => {
    expect(goalImpact(120000, 10000, 5000)).toEqual({ before: 12, after: 8, gained: 4 });
    expect(goalImpact(120000, 0, 5000)).toEqual({ before: null, after: 24, gained: null });
  });
  it('moyenne mensuelle par catégorie', () => {
    const avg = averageMonthlyByCategory(
      [
        tx({ categoryId: 'resto', amount: 3000, date: '2026-08-15' }),
        tx({ categoryId: 'resto', amount: 6000, date: '2026-09-15' }),
        tx({ categoryId: 'resto', amount: 3000, date: '2026-07-10' }),
        tx({ categoryId: 'resto', amount: 99999, date: '2026-01-01' }), // trop ancien
      ],
      '2026-10-07',
    );
    expect(avg.get('resto')).toBe(4000);
  });
  it('moyenne sur la durée réelle si peu d’historique', () => {
    const avg = averageMonthlyByCategory([tx({ categoryId: 'resto', amount: 3000, date: '2026-10-01' })], '2026-10-07');
    expect(avg.get('resto')).toBe(3000);
  });
});

describe('export CSV', () => {
  const cats: Category[] = [{ id: 'c1', name: 'Courses', emoji: '🛒', color: '#000', kind: 'expense', budget: null, order: 0 }];
  const accs: Account[] = [{ id: 'a1', name: 'Courant', type: 'courant', emoji: '💳', color: '#000', initialBalance: 0, order: 0, createdAt: 0 }];
  const csv = transactionsToCSV(
    [
      tx({ amount: 1250, categoryId: 'c1', note: 'Lidl; promo "2+1"', date: '2026-10-02' }),
      tx({ type: 'income', amount: 60000, date: '2026-10-01', note: '=SUM(A1)' }),
    ],
    cats,
    accs,
  );
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  it('BOM + en-tête français', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Date;Type;Montant;Catégorie;Compte;Vers compte;Note;Récurrente');
  });
  it('trie par date, décimale virgule, signe des dépenses', () => {
    expect(lines[1].startsWith('2026-10-01;Revenu;600,00;')).toBe(true);
    expect(lines[2].startsWith('2026-10-02;Dépense;-12,50;Courses;Courant;;')).toBe(true);
  });
  it('échappe les guillemets et neutralise les formules', () => {
    expect(lines[2]).toContain('"Lidl; promo ""2+1"""');
    expect(lines[1]).toContain("'=SUM(A1)");
  });
});

describe('sauvegarde JSON', () => {
  const empty: BackupData = {
    accounts: [],
    categories: [],
    transactions: [tx({ amount: 100, date: '2026-10-01' })],
    recurrings: [],
    goals: [],
    contributions: [],
    groups: [],
    sharedExpenses: [],
    quickAdds: [],
    settings: [],
  };
  it('aller-retour export → import', () => {
    const file = JSON.parse(JSON.stringify(makeBackup(empty)));
    const res = validateBackup(file);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.counts.transactions).toBe(1);
  });
  it('refuse les fichiers étrangers ou corrompus', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ app: 'autre' }).ok).toBe(false);
    expect(validateBackup({ ...makeBackup(empty), version: 99 }).ok).toBe(false);
    const bad = makeBackup({ ...empty, transactions: [tx({ amount: 12.5 })] });
    expect(validateBackup(bad).ok).toBe(false);
    const badDate = makeBackup({ ...empty, transactions: [tx({ date: '2026-02-30' })] });
    expect(validateBackup(badDate).ok).toBe(false);
  });
});

describe('statistiques', () => {
  const p = getPeriod('2026-10-07');
  const txs = [
    tx({ categoryId: 'a', amount: 5000, date: '2026-10-02' }),
    tx({ categoryId: 'b', amount: 2000, date: '2026-10-03' }),
    tx({ categoryId: 'a', amount: 1000, date: '2026-09-03' }),
    tx({ type: 'income', amount: 50000, date: '2026-09-01' }),
  ];
  it('compare au mois précédent', () => {
    const cmp = compareWithPrevious(txs, p, shiftPeriod(p, -1));
    const a = cmp.find((x) => x.categoryId === 'a')!;
    expect(a.delta).toBe(4000);
    expect(a.deltaPct).toBe(400);
    expect(cmp.find((x) => x.categoryId === 'b')!.deltaPct).toBeNull();
  });
  it('historique mois par mois', () => {
    const h = periodHistory(txs, p, 3, 1);
    expect(h.map((x) => x.period.start)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(h[1]).toMatchObject({ income: 50000, expense: 1000, net: 49000 });
  });
  it('top des dépenses', () => {
    expect(topExpenses(txs, p, 1)[0].amount).toBe(5000);
  });
  it('courbe du solde', () => {
    const accs: Account[] = [{ id: 'a1', name: 'C', type: 'courant', emoji: '', color: '', initialBalance: 10000, order: 0, createdAt: 0 }];
    const s = balanceSeries(accs, txs, '2026-10-01', '2026-10-03');
    expect(s.map((x) => x.balance)).toEqual([10000 + 50000 - 1000, 54000, 52000]);
  });
});

describe('calendrier .ics', () => {
  it('produit un rappel quotidien avec alarme', () => {
    const ics = buildIcs([{ uid: 'x', title: 'Note tes dépenses', date: '2026-10-07', time: '20:30', rrule: 'FREQ=DAILY', alarmMinutesBefore: 0 }]);
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20261007T203000');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('TRIGGER:-PT0M');
  });
});

describe('cumulativeSpending', () => {
  it('cumule jour par jour et s’arrête à aujourd’hui', () => {
    const p = getPeriod('2026-10-07');
    const c = cumulativeSpending(
      [tx({ amount: 1000, date: '2026-10-01' }), tx({ amount: 500, date: '2026-10-03' }), tx({ amount: 9999, date: '2026-10-09' })],
      p,
      '2026-10-04',
    );
    expect(c).toEqual([1000, 1000, 1500, 1500]);
  });
});
