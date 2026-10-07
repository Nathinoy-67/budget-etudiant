import type { Account, Cents, ID, ISODate, Transaction } from '../types';
import { addDays, inPeriod, shiftPeriod, type Period } from './dates';
import { accountBalances } from './budget';

export interface CategoryTotal {
  categoryId: ID;
  total: Cents;
}

/** Totaux par catégorie, du plus gros au plus petit. */
export function totalsByCategory(transactions: Transaction[], period: Period, type: 'expense' | 'income' = 'expense'): CategoryTotal[] {
  const map = new Map<ID, Cents>();
  for (const t of transactions) {
    if (t.type !== type || !inPeriod(t.date, period)) continue;
    const k = t.categoryId ?? '';
    map.set(k, (map.get(k) ?? 0) + t.amount);
  }
  return [...map.entries()].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
}

export interface PeriodTotals {
  period: Period;
  income: Cents;
  expense: Cents;
  net: Cents;
}

export function totalsForPeriod(transactions: Transaction[], period: Period): PeriodTotals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (!inPeriod(t.date, period)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { period, income, expense, net: income - expense };
}

/** Totaux des `count` dernières périodes, de la plus ancienne à `current`. */
export function periodHistory(transactions: Transaction[], current: Period, count: number, startDay: number): PeriodTotals[] {
  const out: PeriodTotals[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(totalsForPeriod(transactions, shiftPeriod(current, -i, startDay)));
  return out;
}

export interface CategoryComparison {
  categoryId: ID;
  current: Cents;
  previous: Cents;
  delta: Cents;
  /** Variation en %, null si pas de référence. */
  deltaPct: number | null;
}

/** Comparaison catégorie par catégorie avec la période précédente. */
export function compareWithPrevious(transactions: Transaction[], current: Period, previous: Period): CategoryComparison[] {
  const cur = new Map(totalsByCategory(transactions, current).map((c) => [c.categoryId, c.total]));
  const prev = new Map(totalsByCategory(transactions, previous).map((c) => [c.categoryId, c.total]));
  const ids = new Set([...cur.keys(), ...prev.keys()]);
  return [...ids]
    .map((categoryId) => {
      const c = cur.get(categoryId) ?? 0;
      const p = prev.get(categoryId) ?? 0;
      return { categoryId, current: c, previous: p, delta: c - p, deltaPct: p > 0 ? ((c - p) / p) * 100 : null };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function topExpenses(transactions: Transaction[], period: Period, n = 5): Transaction[] {
  return transactions
    .filter((t) => t.type === 'expense' && inPeriod(t.date, period))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

/** Moyenne de dépense par jour sur les jours écoulés de la période. */
export function averagePerDay(totalSpent: Cents, daysElapsed: number): Cents {
  return daysElapsed > 0 ? Math.round(totalSpent / daysElapsed) : 0;
}

/** Solde total (tous comptes) jour par jour entre from et to inclus. */
export function balanceSeries(
  accounts: Account[],
  transactions: Transaction[],
  from: ISODate,
  to: ISODate,
): { date: ISODate; balance: Cents }[] {
  const start = accountBalances(accounts, transactions, addDays(from, -1));
  let running = [...start.values()].reduce((a, b) => a + b, 0);
  const deltas = new Map<ISODate, Cents>();
  for (const t of transactions) {
    if (t.date < from || t.date > to) continue;
    const d = t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
    if (d) deltas.set(t.date, (deltas.get(t.date) ?? 0) + d);
  }
  const out: { date: ISODate; balance: Cents }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    running += deltas.get(d) ?? 0;
    out.push({ date: d, balance: running });
  }
  return out;
}

/** Dépenses cumulées jour par jour sur une période (index 0 = premier jour), jusqu'à `until` inclus. */
export function cumulativeSpending(transactions: Transaction[], period: Period, until?: ISODate): Cents[] {
  const end = until && until < period.end ? until : period.end;
  const perDay = new Map<ISODate, Cents>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < period.start || t.date > end) continue;
    perDay.set(t.date, (perDay.get(t.date) ?? 0) + t.amount);
  }
  const out: Cents[] = [];
  let sum = 0;
  for (let d = period.start; d <= end; d = addDays(d, 1)) {
    sum += perDay.get(d) ?? 0;
    out.push(sum);
  }
  return out;
}
