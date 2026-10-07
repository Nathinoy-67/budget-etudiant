import type { Cents, Frequency, ISODate, Recurring } from '../types';
import { addDays, addMonths, diffDays, diffMonths, parts } from './dates';

type RecurrenceRule = Pick<Recurring, 'frequency' | 'interval' | 'startDate' | 'endDate' | 'skipped'>;

const MAX_ITER = 5000;

/**
 * Date de la n-ième échéance (n = 0 → première). Calculée depuis l'ancre (startDate)
 * et non de proche en proche : un loyer du 31 tombe le 30 avril puis à nouveau le 31 mai.
 */
export function occurrenceAt(rule: Pick<RecurrenceRule, 'frequency' | 'interval' | 'startDate'>, n: number): ISODate {
  const step = Math.max(1, Math.floor(rule.interval || 1));
  const anchorDay = parts(rule.startDate).day;
  switch (rule.frequency) {
    case 'weekly':
      return addDays(rule.startDate, 7 * step * n);
    case 'monthly':
      return addMonths(rule.startDate, step * n, anchorDay);
    case 'yearly':
      // 29 févr. → 28 févr. les années non bissextiles
      return addMonths(rule.startDate, 12 * step * n, anchorDay);
  }
}

/** Indice approximatif (par défaut) de la première échéance ≥ from. */
function firstIndexFrom(rule: RecurrenceRule, from: ISODate): number {
  if (from <= rule.startDate) return 0;
  const step = Math.max(1, Math.floor(rule.interval || 1));
  let n: number;
  if (rule.frequency === 'weekly') n = Math.floor(diffDays(rule.startDate, from) / (7 * step));
  else if (rule.frequency === 'monthly') n = Math.floor(diffMonths(rule.startDate, from) / step);
  else n = Math.floor(diffMonths(rule.startDate, from) / (12 * step));
  n = Math.max(0, n - 1);
  while (n > 0 && occurrenceAt(rule, n) >= from) n--;
  while (occurrenceAt(rule, n) < from) n++;
  return n;
}

/**
 * Échéances comprises entre from et to (inclus).
 * Par défaut les échéances sautées sont exclues.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: ISODate,
  to: ISODate,
  opts: { includeSkipped?: boolean } = {},
): ISODate[] {
  const out: ISODate[] = [];
  if (to < from) return out;
  const skipped = new Set(rule.skipped ?? []);
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  let n = firstIndexFrom(rule, from);
  for (let i = 0; i < MAX_ITER; i++, n++) {
    const d = occurrenceAt(rule, n);
    if (d > end) break;
    if (d >= from && (opts.includeSkipped || !skipped.has(d))) out.push(d);
  }
  return out;
}

/** Prochaine échéance ≥ from (non sautée), ou null si la récurrence est terminée. */
export function nextOccurrence(rule: RecurrenceRule, from: ISODate): ISODate | null {
  const skipped = new Set(rule.skipped ?? []);
  let n = firstIndexFrom(rule, from);
  for (let i = 0; i < MAX_ITER; i++, n++) {
    const d = occurrenceAt(rule, n);
    if (rule.endDate && d > rule.endDate) return null;
    if (d >= from && !skipped.has(d)) return d;
  }
  return null;
}

/** Prochaines échéances (sautées incluses, pour pouvoir les rétablir). */
export function upcomingOccurrences(rule: RecurrenceRule, from: ISODate, count: number): ISODate[] {
  const out: ISODate[] = [];
  let n = firstIndexFrom(rule, from);
  for (let i = 0; i < MAX_ITER && out.length < count; i++, n++) {
    const d = occurrenceAt(rule, n);
    if (rule.endDate && d > rule.endDate) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/**
 * Échéances à générer maintenant : après la dernière déjà générée, jusqu'à aujourd'hui inclus.
 * Une transaction supprimée par l'utilisateur n'est donc jamais recréée.
 */
export function pendingOccurrences(rec: Recurring, today: ISODate): ISODate[] {
  if (!rec.active) return [];
  const from = rec.lastGenerated ? addDays(rec.lastGenerated, 1) : rec.startDate;
  return occurrencesBetween(rec, from, today);
}

/** Équivalent mensuel d'un montant récurrent (52 semaines / 12 mois). */
export function monthlyEquivalent(amount: Cents, frequency: Frequency, interval = 1): Cents {
  const step = Math.max(1, interval);
  switch (frequency) {
    case 'weekly':
      return Math.round((amount * 52) / 12 / step);
    case 'monthly':
      return Math.round(amount / step);
    case 'yearly':
      return Math.round(amount / 12 / step);
  }
}

export function yearlyEquivalent(amount: Cents, frequency: Frequency, interval = 1): Cents {
  const step = Math.max(1, interval);
  switch (frequency) {
    case 'weekly':
      return Math.round((amount * 52) / step);
    case 'monthly':
      return Math.round((amount * 12) / step);
    case 'yearly':
      return Math.round(amount / step);
  }
}

export function frequencyLabel(frequency: Frequency, interval = 1): string {
  if (interval <= 1) return { weekly: 'Chaque semaine', monthly: 'Chaque mois', yearly: 'Chaque année' }[frequency];
  return { weekly: `Toutes les ${interval} semaines`, monthly: `Tous les ${interval} mois`, yearly: `Tous les ${interval} ans` }[
    frequency
  ];
}

export function frequencyShort(frequency: Frequency, interval = 1): string {
  const base = { weekly: 'sem.', monthly: 'mois', yearly: 'an' }[frequency];
  return interval > 1 ? `/${interval} ${base}` : `/${base}`;
}
