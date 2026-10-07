import { describe, expect, it } from 'vitest';
import type { Recurring } from '../types';
import {
  monthlyEquivalent,
  nextOccurrence,
  occurrenceAt,
  occurrencesBetween,
  pendingOccurrences,
  upcomingOccurrences,
  yearlyEquivalent,
} from './recurrence';

function rec(partial: Partial<Recurring>): Recurring {
  return {
    id: 'r1',
    name: 'Test',
    type: 'expense',
    amount: 1000,
    categoryId: null,
    accountId: 'a1',
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-31',
    endDate: null,
    skipped: [],
    lastGenerated: null,
    active: true,
    isSubscription: false,
    remindDaysBefore: 2,
    createdAt: 0,
    ...partial,
  };
}

describe('occurrenceAt', () => {
  it('mensuel le 31 : borne puis revient au 31', () => {
    const r = rec({ startDate: '2026-01-31' });
    expect([0, 1, 2, 3, 4].map((n) => occurrenceAt(r, n))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });
  it('hebdomadaire', () => {
    const r = rec({ frequency: 'weekly', startDate: '2026-10-05' });
    expect(occurrenceAt(r, 4)).toBe('2026-11-02');
  });
  it('toutes les 2 semaines', () => {
    const r = rec({ frequency: 'weekly', interval: 2, startDate: '2026-10-05' });
    expect(occurrenceAt(r, 1)).toBe('2026-10-19');
  });
  it('annuel le 29 février', () => {
    const r = rec({ frequency: 'yearly', startDate: '2028-02-29' });
    expect(occurrenceAt(r, 1)).toBe('2029-02-28');
    expect(occurrenceAt(r, 4)).toBe('2032-02-29');
  });
  it('trimestriel (tous les 3 mois)', () => {
    const r = rec({ interval: 3, startDate: '2026-01-15' });
    expect(occurrenceAt(r, 2)).toBe('2026-07-15');
  });
});

describe('occurrencesBetween', () => {
  it('liste les échéances de la période', () => {
    const r = rec({ startDate: '2026-01-05' });
    expect(occurrencesBetween(r, '2026-03-01', '2026-05-31')).toEqual(['2026-03-05', '2026-04-05', '2026-05-05']);
  });
  it('exclut les échéances sautées sauf demande', () => {
    const r = rec({ startDate: '2026-01-05', skipped: ['2026-04-05'] });
    expect(occurrencesBetween(r, '2026-03-01', '2026-05-31')).toEqual(['2026-03-05', '2026-05-05']);
    expect(occurrencesBetween(r, '2026-03-01', '2026-05-31', { includeSkipped: true })).toHaveLength(3);
  });
  it('respecte la date de fin', () => {
    const r = rec({ startDate: '2026-01-05', endDate: '2026-03-31' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });
  it('rien avant le début', () => {
    const r = rec({ startDate: '2026-06-01' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-05-31')).toEqual([]);
  });
  it('hebdo sur plusieurs années reste rapide et exact', () => {
    const r = rec({ frequency: 'weekly', startDate: '2020-01-06' });
    const out = occurrencesBetween(r, '2026-10-01', '2026-10-31');
    expect(out).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });
});

describe('nextOccurrence / upcomingOccurrences', () => {
  it('saute les échéances sautées', () => {
    const r = rec({ startDate: '2026-01-10', skipped: ['2026-10-10'] });
    expect(nextOccurrence(r, '2026-10-07')).toBe('2026-11-10');
  });
  it('null après la fin', () => {
    const r = rec({ startDate: '2026-01-10', endDate: '2026-06-30' });
    expect(nextOccurrence(r, '2026-10-07')).toBeNull();
  });
  it('upcoming inclut les sautées (pour les rétablir)', () => {
    const r = rec({ startDate: '2026-01-10', skipped: ['2026-10-10'] });
    expect(upcomingOccurrences(r, '2026-10-07', 2)).toEqual(['2026-10-10', '2026-11-10']);
  });
});

describe('pendingOccurrences', () => {
  it("génère tout depuis le début s'il n'y a rien", () => {
    const r = rec({ startDate: '2026-08-05' });
    expect(pendingOccurrences(r, '2026-10-07')).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
  });
  it('reprend après la dernière générée', () => {
    const r = rec({ startDate: '2026-08-05', lastGenerated: '2026-09-05' });
    expect(pendingOccurrences(r, '2026-10-07')).toEqual(['2026-10-05']);
  });
  it('rien si à jour, en pause, ou sautée', () => {
    expect(pendingOccurrences(rec({ startDate: '2026-08-05', lastGenerated: '2026-10-05' }), '2026-10-07')).toEqual([]);
    expect(pendingOccurrences(rec({ startDate: '2026-08-05', active: false }), '2026-10-07')).toEqual([]);
    expect(
      pendingOccurrences(rec({ startDate: '2026-08-05', lastGenerated: '2026-09-05', skipped: ['2026-10-05'] }), '2026-10-07'),
    ).toEqual([]);
  });
  it("inclut l'échéance du jour même", () => {
    expect(pendingOccurrences(rec({ startDate: '2026-10-07' }), '2026-10-07')).toEqual(['2026-10-07']);
  });
});

describe('équivalents mensuels / annuels', () => {
  it('convertit les fréquences', () => {
    expect(monthlyEquivalent(1000, 'weekly')).toBe(4333);
    expect(monthlyEquivalent(1299, 'monthly')).toBe(1299);
    expect(monthlyEquivalent(12000, 'yearly')).toBe(1000);
    expect(monthlyEquivalent(3000, 'monthly', 3)).toBe(1000);
    expect(yearlyEquivalent(1299, 'monthly')).toBe(15588);
    expect(yearlyEquivalent(1000, 'weekly')).toBe(52000);
  });
});
