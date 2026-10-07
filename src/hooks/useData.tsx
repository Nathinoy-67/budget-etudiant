import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  Account,
  Category,
  Goal,
  GoalContribution,
  ID,
  ISODate,
  QuickAdd,
  Recurring,
  Settings,
  SharedExpense,
  SharedGroup,
  Transaction,
} from '../types';
import { getPeriod, todayISO, type Period } from '../lib/dates';
import { setCurrency } from '../lib/money';

export interface AppData {
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurrings: Recurring[];
  goals: Goal[];
  contributions: GoalContribution[];
  groups: SharedGroup[];
  sharedExpenses: SharedExpense[];
  quickAdds: QuickAdd[];
  today: ISODate;
  period: Period;
  categoryById: Map<ID, Category>;
  accountById: Map<ID, Account>;
}

const DataContext = createContext<AppData | null>(null);

/** Date du jour à Paris, mise à jour à minuit et au retour au premier plan. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const id = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

/**
 * Charge toutes les tables en mémoire (quelques milliers de lignes au plus pour un budget étudiant)
 * et les garde synchronisées avec IndexedDB grâce à useLiveQuery.
 */
export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get('main'), []);
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').toArray(), []);
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
  const recurrings = useLiveQuery(() => db.recurrings.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const contributions = useLiveQuery(() => db.contributions.orderBy('date').reverse().toArray(), []);
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const sharedExpenses = useLiveQuery(() => db.sharedExpenses.orderBy('date').reverse().toArray(), []);
  const quickAdds = useLiveQuery(() => db.quickAdds.orderBy('order').toArray(), []);
  const today = useToday();

  const value = useMemo<AppData | null>(() => {
    if (
      !settings ||
      !accounts ||
      !categories ||
      !transactions ||
      !recurrings ||
      !goals ||
      !contributions ||
      !groups ||
      !sharedExpenses ||
      !quickAdds
    )
      return null;
    setCurrency(settings.currency);
    return {
      settings,
      accounts,
      categories,
      transactions,
      recurrings,
      goals,
      contributions,
      groups,
      sharedExpenses,
      quickAdds,
      today,
      period: getPeriod(today, settings.monthStartDay),
      categoryById: new Map(categories.map((c) => [c.id, c])),
      accountById: new Map(accounts.map((a) => [a.id, a])),
    };
  }, [settings, accounts, categories, transactions, recurrings, goals, contributions, groups, sharedExpenses, quickAdds, today]);

  if (!value) return <>{fallback}</>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): AppData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData doit être utilisé dans <DataProvider>');
  return ctx;
}
