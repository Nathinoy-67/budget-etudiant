import type { Account, Category, Cents, ID, ISODate, Recurring, Transaction } from '../types';
import { addDays, diffDays, inPeriod, periodLength, type Period } from './dates';
import { occurrencesBetween } from './recurrence';

export interface UpcomingItem {
  recurringId: ID;
  name: string;
  date: ISODate;
  amount: Cents;
  type: Recurring['type'];
  categoryId: ID | null;
}

export interface MonthSummary {
  period: Period;
  /** Revenus déjà reçus sur la période. */
  income: Cents;
  /** Revenus récurrents encore attendus d'ici la fin de période. */
  plannedIncome: Cents;
  /** Charges fixes (récurrentes) déjà passées. */
  fixedPaid: Cents;
  /** Charges fixes encore à venir sur la période. */
  fixedUpcoming: Cents;
  /** Dépenses variables (non récurrentes) de la période. */
  variableSpent: Cents;
  /** Toutes les dépenses enregistrées sur la période. */
  totalSpent: Cents;
  /** Solde du mois : revenus reçus − dépenses enregistrées. */
  balance: Cents;
  /** Somme à garder sur le compte en fin de mois (réglage). */
  keepAtEnd: Cents;
  /**
   * Reste à vivre : revenus (reçus + attendus) − charges fixes et abonnements (tous, même pas encore prélevés)
   * − dépenses courantes − somme à garder. Aucune extrapolation : un gros achat ne compte qu'une fois.
   */
  resteAVivre: Cents;
  /** Dépenses d'aujourd'hui. */
  todaySpent: Cents;
  daysTotal: number;
  /** Jours écoulés, aujourd'hui inclus. */
  daysElapsed: number;
  /** Jours restants, aujourd'hui inclus. */
  daysLeft: number;
  /** Part de l'enveloppe du mois (revenus − somme à garder) déjà engagée, en %. */
  engagedPct: number;
  upcoming: UpcomingItem[];
}

/**
 * Calcule la synthèse d'une période budgétaire.
 * Les virements entre comptes sont neutres (ni revenu ni dépense).
 */
export function computeSummary(
  transactions: Transaction[],
  recurrings: Recurring[],
  period: Period,
  today: ISODate,
  keepAtEnd: Cents = 0,
): MonthSummary {
  let income = 0;
  let fixedPaid = 0;
  let variableSpent = 0;
  let todaySpent = 0;

  for (const t of transactions) {
    if (!inPeriod(t.date, period)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') {
      if (t.recurringId) fixedPaid += t.amount;
      else variableSpent += t.amount;
      if (t.date === today) todaySpent += t.amount;
    }
  }

  // Échéances récurrentes pas encore générées d'ici la fin de période
  const upcoming: UpcomingItem[] = [];
  let plannedIncome = 0;
  let fixedUpcoming = 0;
  for (const r of recurrings) {
    if (!r.active || r.type === 'transfer') continue;
    const generatedUntil = r.lastGenerated ?? addDays(r.startDate, -1);
    let from = addDays(generatedUntil, 1);
    if (from < period.start) from = period.start;
    // Les échéances passées non générées (appli fermée) seront générées au prochain lancement :
    // on les compte quand même comme "à venir" pour ne pas fausser le calcul.
    for (const d of occurrencesBetween(r, from, period.end)) {
      upcoming.push({ recurringId: r.id, name: r.name, date: d, amount: r.amount, type: r.type, categoryId: r.categoryId });
      if (r.type === 'income') plannedIncome += r.amount;
      else fixedUpcoming += r.amount;
    }
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const daysTotal = periodLength(period);
  const clampedToday = today < period.start ? period.start : today > period.end ? period.end : today;
  const isCurrent = inPeriod(today, period);
  const daysElapsed = today < period.start ? 0 : diffDays(period.start, clampedToday) + 1;
  const daysLeft = isCurrent ? diffDays(today, period.end) + 1 : today < period.start ? daysTotal : 0;

  const totalIncome = income + plannedIncome;
  const fixedTotal = fixedPaid + fixedUpcoming;
  const keep = Math.max(0, keepAtEnd || 0);
  const resteAVivre = totalIncome - fixedTotal - variableSpent - keep;
  const envelope = totalIncome - keep;
  const engaged = fixedTotal + variableSpent;
  const engagedPct = envelope > 0 ? (engaged / envelope) * 100 : engaged > 0 ? 100 : 0;

  return {
    period,
    income,
    plannedIncome,
    fixedPaid,
    fixedUpcoming,
    variableSpent,
    totalSpent: fixedPaid + variableSpent,
    balance: income - (fixedPaid + variableSpent),
    keepAtEnd: keep,
    resteAVivre,
    todaySpent,
    daysTotal,
    daysElapsed,
    daysLeft,
    engagedPct,
    upcoming,
  };
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

export interface CategoryBudgetStatus {
  category: Category;
  budget: Cents;
  spent: Cents;
  remaining: Cents;
  pct: number;
  level: BudgetLevel;
}

export function budgetLevel(pct: number): BudgetLevel {
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warn';
  return 'ok';
}

/** Dépenses par catégorie sur une période. */
export function spentByCategory(transactions: Transaction[], period: Period): Map<ID, Cents> {
  const map = new Map<ID, Cents>();
  for (const t of transactions) {
    if (t.type !== 'expense' || !inPeriod(t.date, period)) continue;
    const key = t.categoryId ?? '';
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }
  return map;
}

/** État des budgets par catégorie (seulement les catégories avec plafond). */
export function categoryBudgets(categories: Category[], transactions: Transaction[], period: Period): CategoryBudgetStatus[] {
  const spent = spentByCategory(transactions, period);
  return categories
    .filter((c) => c.kind === 'expense' && !c.archived && c.budget != null && c.budget > 0)
    .map((c) => {
      const s = spent.get(c.id) ?? 0;
      const budget = c.budget as Cents;
      const pct = (s / budget) * 100;
      return { category: c, budget, spent: s, remaining: budget - s, pct, level: budgetLevel(pct) };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Solde de chaque compte à une date donnée (incluse). */
export function accountBalances(accounts: Account[], transactions: Transaction[], until?: ISODate): Map<ID, Cents> {
  const map = new Map<ID, Cents>();
  for (const a of accounts) map.set(a.id, a.initialBalance);
  for (const t of transactions) {
    if (until && t.date > until) continue;
    if (t.type === 'income') map.set(t.accountId, (map.get(t.accountId) ?? 0) + t.amount);
    else if (t.type === 'expense') map.set(t.accountId, (map.get(t.accountId) ?? 0) - t.amount);
    else if (t.type === 'transfer') {
      map.set(t.accountId, (map.get(t.accountId) ?? 0) - t.amount);
      if (t.toAccountId) map.set(t.toAccountId, (map.get(t.toAccountId) ?? 0) + t.amount);
    }
  }
  return map;
}

/** Revenus de la période par type de source (job, aides, bourse, famille…). */
export function incomeBySource(
  transactions: Transaction[],
  categories: Category[],
  period: Period,
): Record<string, Cents> {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const out: Record<string, Cents> = {};
  for (const t of transactions) {
    if (t.type !== 'income' || !inPeriod(t.date, period)) continue;
    const src = (t.categoryId && catById.get(t.categoryId)?.incomeSource) || 'autre';
    out[src] = (out[src] ?? 0) + t.amount;
  }
  return out;
}

/** Seuil franchi par une nouvelle dépense (pour déclencher une alerte une seule fois). */
export function crossedLevel(before: Cents, after: Cents, budget: Cents): BudgetLevel | null {
  if (!budget || budget <= 0) return null;
  const b = (before / budget) * 100;
  const a = (after / budget) * 100;
  if (a >= 100 && b < 100) return 'over';
  if (a >= 80 && b < 80) return 'warn';
  return null;
}
