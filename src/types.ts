/** Identifiant unique (UUID). */
export type ID = string;
/** Date locale au format AAAA-MM-JJ (fuseau Europe/Paris). */
export type ISODate = string;
/** Montant en centimes (entier) : évite les erreurs d'arrondi des flottants. */
export type Cents = number;

export type AccountType = 'courant' | 'epargne' | 'livret' | 'especes' | 'autre';

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  emoji: string;
  color: string;
  initialBalance: Cents;
  order: number;
  archived?: boolean;
  createdAt: number;
}

export type CategoryKind = 'expense' | 'income';
export type IncomeSource = 'job' | 'aide' | 'bourse' | 'famille' | 'autre';

export interface Category {
  id: ID;
  name: string;
  emoji: string;
  color: string;
  kind: CategoryKind;
  /** Plafond mensuel (dépenses uniquement), null = pas de budget. */
  budget: Cents | null;
  /** Pour les revenus : type de source, pour le suivi séparé. */
  incomeSource?: IncomeSource;
  order: number;
  archived?: boolean;
}

export type TxType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: ID;
  type: TxType;
  /** Toujours positif ; le sens dépend du type. */
  amount: Cents;
  date: ISODate;
  categoryId: ID | null;
  accountId: ID;
  /** Compte de destination (virements uniquement). */
  toAccountId?: ID | null;
  note: string;
  /** Opération récurrente d'origine, et date d'échéance correspondante. */
  recurringId?: ID | null;
  occurrence?: ISODate | null;
  /** Origine automatique : paiement Apple Pay (raccourci iOS) ou import d'un relevé bancaire. */
  source?: 'applepay' | 'import' | null;
  /** Nom brut du commerçant transmis par l'iPhone. */
  merchant?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export interface Recurring {
  id: ID;
  name: string;
  type: TxType;
  amount: Cents;
  categoryId: ID | null;
  accountId: ID;
  toAccountId?: ID | null;
  frequency: Frequency;
  /** Toutes les N semaines / mois / années. */
  interval: number;
  /** Première échéance (sert d'ancre pour le jour du mois). */
  startDate: ISODate;
  endDate?: ISODate | null;
  /** Échéances sautées. */
  skipped: ISODate[];
  /** Dernière échéance déjà générée (null = aucune). */
  lastGenerated: ISODate | null;
  active: boolean;
  isSubscription: boolean;
  /** Ancien rappel avant renouvellement (plus utilisé). */
  remindDaysBefore: number;
  emoji?: string;
  createdAt: number;
}

export interface Goal {
  id: ID;
  name: string;
  emoji: string;
  color: string;
  target: Cents;
  targetDate: ISODate | null;
  archived?: boolean;
  createdAt: number;
}

export interface GoalContribution {
  id: ID;
  goalId: ID;
  /** Positif = versement, négatif = retrait. */
  amount: Cents;
  date: ISODate;
  note: string;
  createdAt: number;
}

export interface Member {
  id: ID;
  name: string;
  isMe?: boolean;
}

export interface SharedGroup {
  id: ID;
  name: string;
  emoji: string;
  members: Member[];
  createdAt: number;
}

export interface Split {
  memberId: ID;
  share: Cents;
}

export interface SharedExpense {
  id: ID;
  groupId: ID;
  /** settlement = remboursement : paidBy rembourse splits[0].memberId. */
  kind: 'expense' | 'settlement';
  description: string;
  amount: Cents;
  paidBy: ID;
  splits: Split[];
  date: ISODate;
  createdAt: number;
}

export interface QuickAdd {
  id: ID;
  label: string;
  emoji: string;
  amount: Cents;
  categoryId: ID | null;
  accountId: ID | null;
  order: number;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface NotificationPrefs {
  dailyReminder: boolean;
  reminderTime: string; // HH:MM
  /** Anciennes alertes (budget, renouvellement d'abonnement), retirées : ignorées si présentes. */
  budgetAlerts?: boolean;
  subscriptionReminders?: boolean;
}

export interface Settings {
  id: 'main';
  currency: string;
  /** Premier jour de la période budgétaire (1–31, borné au dernier jour du mois). */
  monthStartDay: number;
  /** Somme minimale à garder sur le compte à la fin du mois (déduite du reste à vivre). */
  keepAtEnd?: Cents;
  /** Données exemple chargées : les vraies données sont mises de côté (table « vault »). */
  demoMode?: boolean;
  theme: ThemePref;
  onboarded: boolean;
  defaultAccountId: ID | null;
  haptics: boolean;
  pin: { hash: string; salt: string } | null;
  biometricId: string | null;
  /** Délai avant reverrouillage quand l'appli passe en arrière-plan. */
  lockAfterMinutes: number;
  backupReminderDays: number;
  lastBackupAt: number | null;
  notifications: NotificationPrefs;
  /** Clés des notifications déjà envoyées (anti-doublon). */
  notified: string[];
  /** Catégories apprises par commerçant (clé = merchantKey). */
  merchantRules?: Record<ID, ID>;
  /** Dernier paiement Apple Pay reçu (horodatage) et nombre total reçu. */
  lastApplePayAt?: number | null;
  applePayCount?: number;
  /** Clé secrète du relais Apple Pay (Cloudflare Worker), générée par l'appli. */
  relayKey?: string | null;
  createdAt: number;
}
