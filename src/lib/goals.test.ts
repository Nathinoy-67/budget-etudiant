import { describe, expect, it } from 'vitest';
import type { Goal, GoalContribution } from '../types';
import { goalProgress, monthsToReach, monthsUntil, suggestedMonthly } from './goals';

const goal = (p: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Permis',
  emoji: '🚗',
  color: '#000',
  target: 150000,
  targetDate: '2027-06-07',
  createdAt: 0,
  ...p,
});
const c = (amount: number, date: string, goalId = 'g1'): GoalContribution => ({
  id: `${goalId}-${date}-${amount}`,
  goalId,
  amount,
  date,
  note: '',
  createdAt: 0,
});

describe('suggestedMonthly / monthsToReach', () => {
  it('arrondit au centime supérieur', () => {
    expect(suggestedMonthly(100000, 3)).toBe(33334);
    expect(suggestedMonthly(0, 3)).toBe(0);
    expect(suggestedMonthly(5000, 0)).toBe(5000);
  });
  it('mois nécessaires', () => {
    expect(monthsToReach(100000, 25000)).toBe(4);
    expect(monthsToReach(100001, 25000)).toBe(5);
    expect(monthsToReach(1000, 0)).toBeNull();
    expect(monthsToReach(0, 0)).toBe(0);
  });
  it('monthsUntil : au moins 1 mois si la date est future', () => {
    expect(monthsUntil('2026-10-07', '2026-10-20')).toBe(1);
    expect(monthsUntil('2026-10-07', '2027-06-07')).toBe(8);
    expect(monthsUntil('2026-10-07', '2026-10-01')).toBe(0);
  });
});

describe('goalProgress', () => {
  const today = '2026-10-07';
  it('calcule progression et versement conseillé', () => {
    const p = goalProgress(goal(), [c(30000, '2026-08-01'), c(20000, '2026-09-01'), c(-5000, '2026-09-15'), c(99999, '2026-09-01', 'autre')], today);
    expect(p.saved).toBe(45000);
    expect(p.remaining).toBe(105000);
    expect(p.pct).toBeCloseTo(30);
    expect(p.monthsLeft).toBe(8);
    expect(p.suggestedMonthly).toBe(13125);
    expect(p.overdue).toBe(false);
    expect(p.reached).toBe(false);
  });
  it('objectif atteint', () => {
    const p = goalProgress(goal(), [c(160000, '2026-09-01')], today);
    expect(p.reached).toBe(true);
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.suggestedMonthly).toBe(0);
  });
  it('date dépassée', () => {
    const p = goalProgress(goal({ targetDate: '2026-09-01' }), [c(1000, '2026-08-01')], today);
    expect(p.overdue).toBe(true);
    expect(p.monthsLeft).toBe(0);
    expect(p.suggestedMonthly).toBe(149000);
  });
  it('sans date cible : estimation selon le rythme récent', () => {
    const p = goalProgress(goal({ targetDate: null }), [c(15000, '2026-08-10'), c(15000, '2026-09-10'), c(15000, '2026-10-01')], today);
    expect(p.monthsLeft).toBeNull();
    expect(p.recentMonthlyAverage).toBe(15000);
    expect(p.eta).toBe('2027-05-07'); // 105 000 / 15 000 = 7 mois
  });
  it('sans versement : pas d’estimation', () => {
    expect(goalProgress(goal({ targetDate: null }), [], today).eta).toBeNull();
  });
});
