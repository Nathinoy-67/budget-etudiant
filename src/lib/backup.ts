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
import { isValidISO } from './dates';

export const BACKUP_APP = 'budget-etudiant';
export const BACKUP_VERSION = 1;

export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurrings: Recurring[];
  goals: Goal[];
  contributions: GoalContribution[];
  groups: SharedGroup[];
  sharedExpenses: SharedExpense[];
  quickAdds: QuickAdd[];
  settings: Settings[];
}

export const TABLE_NAMES: (keyof BackupData)[] = [
  'accounts',
  'categories',
  'transactions',
  'recurrings',
  'goals',
  'contributions',
  'groups',
  'sharedExpenses',
  'quickAdds',
  'settings',
];

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: BackupData;
}

export function makeBackup(data: BackupData, now = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type ValidationResult = { ok: true; backup: BackupFile; counts: Record<string, number> } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v);

/** Vérifie qu'un fichier importé est bien une sauvegarde valide de l'appli. */
export function validateBackup(raw: unknown): ValidationResult {
  if (!isObj(raw)) return { ok: false, error: "Ce fichier n'est pas une sauvegarde valide." };
  if (raw.app !== BACKUP_APP) return { ok: false, error: "Ce fichier ne provient pas de Budget Étudiant." };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION)
    return { ok: false, error: "Cette sauvegarde vient d'une version plus récente de l'appli." };
  if (!isObj(raw.data)) return { ok: false, error: 'Sauvegarde incomplète.' };
  const data = raw.data as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const name of TABLE_NAMES) {
    const table = data[name] ?? [];
    if (!Array.isArray(table)) return { ok: false, error: `Section « ${name} » invalide.` };
    if (!table.every((row) => isObj(row) && typeof row.id === 'string'))
      return { ok: false, error: `Section « ${name} » : élément sans identifiant.` };
    counts[name] = table.length;
    data[name] = table;
  }
  const txs = data.transactions as Transaction[];
  for (const t of txs) {
    if (!['expense', 'income', 'transfer'].includes(t.type) || !isInt(t.amount) || !isValidISO(t.date) || typeof t.accountId !== 'string')
      return { ok: false, error: 'Une transaction de la sauvegarde est invalide.' };
  }
  for (const a of data.accounts as Account[]) {
    if (typeof a.name !== 'string' || !isInt(a.initialBalance)) return { ok: false, error: 'Un compte de la sauvegarde est invalide.' };
  }
  for (const r of data.recurrings as Recurring[]) {
    if (!['weekly', 'monthly', 'yearly'].includes(r.frequency) || !isValidISO(r.startDate) || !isInt(r.amount))
      return { ok: false, error: 'Une opération récurrente de la sauvegarde est invalide.' };
    if (!Array.isArray(r.skipped)) r.skipped = [];
  }
  return { ok: true, backup: raw as unknown as BackupFile, counts };
}
