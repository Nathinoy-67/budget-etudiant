import type { Cents, ID, ISODate, Transaction } from '../types';
import { addMonths, diffDays } from './dates';
import { monthsToReach } from './goals';

/** Dépense mensuelle moyenne par catégorie sur les `months` derniers mois glissants. */
export function averageMonthlyByCategory(transactions: Transaction[], today: ISODate, months = 3): Map<ID, Cents> {
  const from = addMonths(today, -months);
  const sums = new Map<ID, Cents>();
  let earliest: ISODate | null = null;
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date <= from || t.date > today) continue;
    const key = t.categoryId ?? '';
    sums.set(key, (sums.get(key) ?? 0) + t.amount);
    if (!earliest || t.date < earliest) earliest = t.date;
  }
  // Avec moins d'historique que `months`, on divise par la durée réellement couverte (≥ 1 mois)
  const covered = earliest ? Math.min(months, Math.max(1, Math.round((diffDays(earliest, today) + 1) / 30.44))) : months;
  const out = new Map<ID, Cents>();
  for (const [k, v] of sums) out.set(k, Math.round(v / covered));
  return out;
}

export interface Adjustment {
  /** Économie mensuelle (positive) ou dépense supplémentaire (négative). */
  monthly: Cents;
}

export interface SimulationResult {
  monthly: Cents;
  yearly: Cents;
  /** Cumul sur l'horizon choisi. */
  total: Cents;
  horizonMonths: number;
  /** Cumul mois par mois, pour un graphique. */
  series: { month: number; cumulative: Cents }[];
}

/** Économies cumulées d'une liste d'ajustements mensuels. */
export function simulate(adjustments: Adjustment[], horizonMonths = 12): SimulationResult {
  const monthly = adjustments.reduce((s, a) => s + a.monthly, 0);
  const series = Array.from({ length: horizonMonths }, (_, i) => ({ month: i + 1, cumulative: monthly * (i + 1) }));
  return { monthly, yearly: monthly * 12, total: monthly * horizonMonths, horizonMonths, series };
}

/** Réduction en pourcentage d'une dépense mensuelle moyenne. */
export function reductionFromPercent(average: Cents, pct: number): Cents {
  return Math.round((average * Math.min(100, Math.max(0, pct))) / 100);
}

export interface GoalImpact {
  before: number | null;
  after: number | null;
  /** Mois gagnés (null si non calculable). */
  gained: number | null;
}

/** Impact d'une économie mensuelle supplémentaire sur le délai pour atteindre un objectif. */
export function goalImpact(remaining: Cents, currentMonthly: Cents, extraMonthly: Cents): GoalImpact {
  const before = monthsToReach(remaining, currentMonthly);
  const after = monthsToReach(remaining, currentMonthly + extraMonthly);
  const gained = before != null && after != null ? before - after : null;
  return { before, after, gained };
}
