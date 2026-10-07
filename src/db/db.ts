import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Category,
  Goal,
  GoalContribution,
  QuickAdd,
  Recurring,
  Settings,
  SharedExpense,
  SharedGroup,
  Transaction,
} from '../types';

export class BudgetDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  recurrings!: Table<Recurring, string>;
  goals!: Table<Goal, string>;
  contributions!: Table<GoalContribution, string>;
  groups!: Table<SharedGroup, string>;
  sharedExpenses!: Table<SharedExpense, string>;
  quickAdds!: Table<QuickAdd, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('budget-etudiant');
    this.version(1).stores({
      accounts: 'id, order',
      categories: 'id, kind, order',
      transactions: 'id, date, type, categoryId, accountId, recurringId, [recurringId+occurrence]',
      recurrings: 'id, active',
      goals: 'id',
      contributions: 'id, goalId, date',
      groups: 'id',
      sharedExpenses: 'id, groupId, date',
      quickAdds: 'id, order',
      settings: 'id',
    });
  }
}

export const db = new BudgetDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
