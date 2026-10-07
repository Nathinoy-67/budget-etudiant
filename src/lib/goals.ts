import type { Cents, Goal, GoalContribution, ISODate } from '../types';
import { addMonths, diffMonths } from './dates';

export interface GoalProgress {
  saved: Cents;
  remaining: Cents;
  pct: number;
  reached: boolean;
  /** Mois restants avant la date cible (≥ 1 si la date est future), null sans date. */
  monthsLeft: number | null;
  /** Versement mensuel conseillé pour atteindre la cible à temps. */
  suggestedMonthly: Cents | null;
  /** Date cible dépassée sans avoir atteint l'objectif. */
  overdue: boolean;
  /** Moyenne mensuelle versée sur les 3 derniers mois. */
  recentMonthlyAverage: Cents;
  /** Date estimée d'atteinte au rythme récent, null si rythme nul. */
  eta: ISODate | null;
}

export function goalSaved(goalId: string, contributions: GoalContribution[]): Cents {
  return contributions.reduce((sum, c) => (c.goalId === goalId ? sum + c.amount : sum), 0);
}

/** Mois restants : au moins 1 tant que la date cible n'est pas passée. */
export function monthsUntil(today: ISODate, target: ISODate): number {
  if (target < today) return 0;
  return Math.max(1, diffMonths(today, target));
}

/** Versement mensuel pour atteindre `remaining` en `months` mois (arrondi au centime supérieur). */
export function suggestedMonthly(remaining: Cents, months: number): Cents {
  if (remaining <= 0) return 0;
  if (months <= 0) return remaining;
  return Math.ceil(remaining / months);
}

/** Nombre de mois pour épargner `remaining` à raison de `monthly` par mois. */
export function monthsToReach(remaining: Cents, monthly: Cents): number | null {
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}

export function goalProgress(goal: Goal, contributions: GoalContribution[], today: ISODate): GoalProgress {
  const own = contributions.filter((c) => c.goalId === goal.id);
  const saved = own.reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(0, goal.target - saved);
  const pct = goal.target > 0 ? Math.min(100, Math.max(0, (saved / goal.target) * 100)) : 0;
  const reached = goal.target > 0 && saved >= goal.target;

  let monthsLeft: number | null = null;
  let suggested: Cents | null = null;
  let overdue = false;
  if (goal.targetDate) {
    monthsLeft = monthsUntil(today, goal.targetDate);
    overdue = !reached && goal.targetDate < today;
    suggested = reached ? 0 : suggestedMonthly(remaining, monthsLeft);
  }

  const threeMonthsAgo = addMonths(today, -3);
  const recent = own.filter((c) => c.date > threeMonthsAgo && c.date <= today).reduce((s, c) => s + c.amount, 0);
  const recentMonthlyAverage = Math.max(0, Math.round(recent / 3));
  const m = monthsToReach(remaining, recentMonthlyAverage);
  const eta = reached ? today : m == null ? null : addMonths(today, m);

  return { saved, remaining, pct, reached, monthsLeft, suggestedMonthly: suggested, overdue, recentMonthlyAverage, eta };
}
