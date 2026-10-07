import type { Category, Recurring, Transaction } from '../types';
import { db, uid } from './db';
import { buildDefaultAccounts, buildDefaultCategories, defaultSettings } from './defaults';
import { addDays, addMonths, diffDays, parts, todayISO, toISO } from '../lib/dates';
import { resetAll, generateDueRecurring, type NewRecurring } from './actions';

/** Générateur pseudo-aléatoire déterministe (mêmes données à chaque chargement). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Remplace toutes les données par un jeu d'exemple réaliste sur ~3 mois (un seul compte courant). */
export async function loadDemoData(): Promise<void> {
  await resetAll();
  const today = todayISO();
  const now = Date.now();
  const categories = buildDefaultCategories();
  const cat = (name: string) => categories.find((c) => c.name === name) as Category;

  // Budgets mensuels
  const budgets: Record<string, number> = {
    Courses: 18000,
    'Restau/Fast-food': 6000,
    Transport: 3000,
    Loisirs: 5000,
    Vêtements: 4000,
    'Sport/Santé': 4000,
  };
  for (const c of categories) if (budgets[c.name]) c.budget = budgets[c.name];

  const [courant] = buildDefaultAccounts(now);
  courant.initialBalance = 42000;

  await db.categories.bulkAdd(categories);
  await db.accounts.add(courant);
  await db.settings.add({ ...defaultSettings(now), onboarded: true, defaultAccountId: courant.id });

  const start = toISO(parts(addMonths(today, -3)).y, parts(addMonths(today, -3)).m, 1);
  const day = (d: number) => toISO(parts(start).y, parts(start).m, d);

  // Revenus et charges fixes récurrents (générés automatiquement jusqu'à aujourd'hui)
  const base = { interval: 1, endDate: null, active: true, remindDaysBefore: 2, toAccountId: null, accountId: courant.id, frequency: 'monthly' as const };
  const recs: NewRecurring[] = [
    { ...base, name: 'Job étudiant', type: 'income', amount: 62000, categoryId: cat('Job étudiant').id, startDate: day(1), isSubscription: false, emoji: '💼' },
    { ...base, name: 'APL', type: 'income', amount: 19500, categoryId: cat('APL / CAF').id, startDate: day(5), isSubscription: false, emoji: '🏛️' },
    { ...base, name: 'Virement des parents', type: 'income', amount: 15000, categoryId: cat('Parents / famille').id, startDate: day(3), isSubscription: false, emoji: '👨‍👩‍👧' },
    { ...base, name: 'Bourse CROUS', type: 'income', amount: 14500, categoryId: cat('Bourse').id, startDate: day(10), isSubscription: false, emoji: '🎓' },
    { ...base, name: 'Loyer', type: 'expense', amount: 48000, categoryId: cat('Loyer').id, startDate: day(5), isSubscription: false, emoji: '🏠' },
    { ...base, name: 'Spotify Étudiant', type: 'expense', amount: 599, categoryId: cat('Abonnements').id, startDate: day(12), isSubscription: true, emoji: '🎵' },
    { ...base, name: 'Netflix', type: 'expense', amount: 799, categoryId: cat('Abonnements').id, startDate: day(18), isSubscription: true, emoji: '🎬' },
    { ...base, name: 'Forfait mobile', type: 'expense', amount: 999, categoryId: cat('Abonnements').id, startDate: day(8), isSubscription: true, emoji: '📱' },
    { ...base, name: 'Salle de sport', type: 'expense', amount: 2499, categoryId: cat('Sport/Santé').id, startDate: day(2), isSubscription: true, emoji: '💪' },
  ];
  await db.recurrings.bulkAdd(recs.map((r): Recurring => ({ skipped: [], lastGenerated: null, ...r, id: uid(), createdAt: now })));

  // Dépenses courantes
  const r = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const variable: [string, number, number, string[], number][] = [
    // catégorie, min €, max €, notes, probabilité par jour
    ['Courses', 8, 45, ['Lidl', 'Carrefour City', 'Monoprix', 'Marché'], 0.22],
    ['Restau/Fast-food', 4, 18, ['Kebab', 'McDo', 'Sushi', 'Café', 'Boulangerie', 'RU'], 0.4],
    ['Transport', 2, 15, ['Uber', 'Ticket', 'Trottinette', 'BlaBlaCar'], 0.12],
    ['Loisirs', 6, 35, ['Ciné', 'Bar', 'Concert', 'Jeu vidéo', 'Bowling'], 0.12],
    ['Vêtements', 15, 60, ['Zara', 'Vinted', 'Decathlon'], 0.04],
    ['Études', 5, 30, ['Photocopies', 'Livre', 'Fournitures'], 0.05],
    ['Sport/Santé', 5, 25, ['Pharmacie', 'Protéines'], 0.04],
    ['Autre', 3, 20, ['Cadeau', 'Coiffeur', 'Divers'], 0.04],
  ];
  const txs: Transaction[] = [];
  const total = diffDays(start, today);
  for (let i = 0; i <= total; i++) {
    const d = addDays(start, i);
    for (const [name, min, max, notes, p] of variable) {
      if (r() > p) continue;
      const amount = Math.round((min + r() * (max - min)) * 100);
      txs.push({
        id: uid(),
        type: 'expense',
        amount,
        date: d,
        categoryId: cat(name).id,
        accountId: courant.id,
        note: pick(notes),
        createdAt: now + i,
        updatedAt: now + i,
      });
    }
  }
  await db.transactions.bulkAdd(txs);

  await generateDueRecurring(today);
}
