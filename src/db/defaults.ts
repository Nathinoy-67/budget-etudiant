import type { Account, Category, QuickAdd, Settings } from '../types';
import { uid } from './db';

export const PALETTE = [
  '#5B5BD6', // indigo
  '#E5484D', // rouge
  '#F76B15', // orange
  '#FFB224', // ambre
  '#30A46C', // vert
  '#12A594', // turquoise
  '#0090FF', // bleu
  '#8E4EC6', // violet
  '#D6409F', // rose
  '#8D8D8D', // gris
  '#A18072', // brun
  '#3E63DD', // bleu roi
];

export const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, 'id' | 'order'>[] = [
  { name: 'Loyer', emoji: '🏠', color: '#5B5BD6', kind: 'expense', budget: null },
  { name: 'Courses', emoji: '🛒', color: '#30A46C', kind: 'expense', budget: null },
  { name: 'Restau/Fast-food', emoji: '🍔', color: '#F76B15', kind: 'expense', budget: null },
  { name: 'Transport', emoji: '🚌', color: '#0090FF', kind: 'expense', budget: null },
  { name: 'Abonnements', emoji: '📱', color: '#8E4EC6', kind: 'expense', budget: null },
  { name: 'Sport/Santé', emoji: '💪', color: '#12A594', kind: 'expense', budget: null },
  { name: 'Loisirs', emoji: '🎉', color: '#D6409F', kind: 'expense', budget: null },
  { name: 'Vêtements', emoji: '👕', color: '#FFB224', kind: 'expense', budget: null },
  { name: 'Études', emoji: '📚', color: '#3E63DD', kind: 'expense', budget: null },
  { name: 'Autre', emoji: '📦', color: '#8D8D8D', kind: 'expense', budget: null },
];

export const DEFAULT_INCOME_CATEGORIES: Omit<Category, 'id' | 'order'>[] = [
  { name: 'Job étudiant', emoji: '💼', color: '#30A46C', kind: 'income', budget: null, incomeSource: 'job' },
  { name: 'APL / CAF', emoji: '🏛️', color: '#0090FF', kind: 'income', budget: null, incomeSource: 'aide' },
  { name: 'Bourse', emoji: '🎓', color: '#5B5BD6', kind: 'income', budget: null, incomeSource: 'bourse' },
  { name: 'Parents / famille', emoji: '👨‍👩‍👧', color: '#D6409F', kind: 'income', budget: null, incomeSource: 'famille' },
  { name: 'Autre revenu', emoji: '💶', color: '#8D8D8D', kind: 'income', budget: null, incomeSource: 'autre' },
];

export const INCOME_SOURCE_LABEL: Record<string, string> = {
  job: 'Job / salaire',
  aide: 'Aides (APL…)',
  bourse: 'Bourse',
  famille: 'Famille',
  autre: 'Autre',
};

export function buildDefaultCategories(): Category[] {
  return [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({ ...c, id: uid(), order: i })),
    ...DEFAULT_INCOME_CATEGORIES.map((c, i) => ({ ...c, id: uid(), order: i })),
  ];
}

export function buildDefaultAccounts(now = Date.now()): Account[] {
  return [
    { id: uid(), name: 'Compte courant', type: 'courant', emoji: '💳', color: '#5B5BD6', initialBalance: 0, order: 0, createdAt: now },
    { id: uid(), name: 'Livret A', type: 'livret', emoji: '🏦', color: '#30A46C', initialBalance: 0, order: 1, createdAt: now },
    { id: uid(), name: 'Espèces', type: 'especes', emoji: '💵', color: '#FFB224', initialBalance: 0, order: 2, createdAt: now },
  ];
}

export function buildDefaultQuickAdds(categories: Category[]): QuickAdd[] {
  const byName = (n: string) => categories.find((c) => c.name === n)?.id ?? null;
  return [
    { id: uid(), label: 'Café', emoji: '☕', amount: 150, categoryId: byName('Restau/Fast-food'), accountId: null, order: 0 },
    { id: uid(), label: 'Ticket de bus', emoji: '🎫', amount: 200, categoryId: byName('Transport'), accountId: null, order: 1 },
    { id: uid(), label: 'Courses', emoji: '🛒', amount: 2500, categoryId: byName('Courses'), accountId: null, order: 2 },
    { id: uid(), label: 'Menu RU', emoji: '🍽️', amount: 100, categoryId: byName('Restau/Fast-food'), accountId: null, order: 3 },
  ];
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    id: 'main',
    currency: 'EUR',
    monthStartDay: 1,
    theme: 'system',
    onboarded: false,
    defaultAccountId: null,
    haptics: true,
    pin: null,
    biometricId: null,
    lockAfterMinutes: 1,
    backupReminderDays: 14,
    lastBackupAt: null,
    notifications: { dailyReminder: false, reminderTime: '21:00', budgetAlerts: true, subscriptionReminders: true },
    notified: [],
    createdAt: now,
  };
}

export const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = {
  courant: 'Compte courant',
  epargne: 'Épargne',
  livret: 'Livret',
  especes: 'Espèces',
  autre: 'Autre',
};

export const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'CHF', label: 'Franc suisse (CHF)' },
  { code: 'USD', label: 'Dollar US ($)' },
  { code: 'GBP', label: 'Livre sterling (£)' },
  { code: 'CAD', label: 'Dollar canadien ($ CA)' },
  { code: 'XOF', label: 'Franc CFA (F CFA)' },
  { code: 'MAD', label: 'Dirham marocain (MAD)' },
];

export const EMOJI_CHOICES = [
  '🏠', '🛒', '🍔', '🍕', '☕', '🍺', '🚌', '🚇', '🚗', '⛽', '🚲', '✈️', '📱', '💻', '🎮', '🎬', '🎵', '📺',
  '💪', '💊', '🏥', '🎉', '🎁', '👕', '👟', '💇', '📚', '✏️', '🎓', '📦', '🐶', '💡', '💧', '🔥', '🧾', '🏦',
  '💳', '💵', '💶', '🪙', '💰', '💼', '🏛️', '👨‍👩‍👧', '🎯', '🚀', '🏖️', '🎸', '🧳', '🛵', '🖥️', '📷', '⚽', '🧺',
];
