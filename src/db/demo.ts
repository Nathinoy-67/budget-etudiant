import type { Category, Recurring, Transaction } from '../types';
import { db, uid } from './db';
import { buildDefaultAccounts, buildDefaultCategories, buildDefaultQuickAdds, defaultSettings } from './defaults';
import { addDays, addMonths, diffDays, parts, todayISO, toISO } from '../lib/dates';
import { equalSplits } from '../lib/split';
import { resetAll, generateDueRecurring, type NewRecurring } from './actions';

/** Générateur pseudo-aléatoire déterministe (mêmes données à chaque chargement). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Remplace toutes les données par un jeu d'exemple réaliste sur ~3 mois. */
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

  const accounts = buildDefaultAccounts(now);
  accounts[0].initialBalance = 42000;
  accounts[1].initialBalance = 85000;
  accounts[2].initialBalance = 3000;
  const [courant, livret, especes] = accounts;

  await db.categories.bulkAdd(categories);
  await db.accounts.bulkAdd(accounts);
  await db.quickAdds.bulkAdd(buildDefaultQuickAdds(categories));
  await db.settings.add({ ...defaultSettings(now), onboarded: true, defaultAccountId: courant.id });

  const start = toISO(parts(addMonths(today, -3)).y, parts(addMonths(today, -3)).m, 1);
  const day = (d: number) => toISO(parts(start).y, parts(start).m, d);

  // Revenus et charges fixes récurrents (générés automatiquement jusqu'à aujourd'hui)
  const base = { interval: 1, endDate: null, active: true, remindDaysBefore: 2, toAccountId: null };
  const recs: NewRecurring[] = [];
  recs.push({ ...base, name: 'Job étudiant (McDo)', type: 'income', amount: 62000, categoryId: cat('Job étudiant').id, accountId: courant.id, frequency: 'monthly', startDate: day(1), isSubscription: false, emoji: '💼' });
  recs.push({ ...base, name: 'APL', type: 'income', amount: 19500, categoryId: cat('APL / CAF').id, accountId: courant.id, frequency: 'monthly', startDate: day(5), isSubscription: false, emoji: '🏛️' });
  recs.push({ ...base, name: 'Virement des parents', type: 'income', amount: 15000, categoryId: cat('Parents / famille').id, accountId: courant.id, frequency: 'monthly', startDate: day(3), isSubscription: false, emoji: '👨‍👩‍👧' });
  recs.push({ ...base, name: 'Bourse CROUS', type: 'income', amount: 14500, categoryId: cat('Bourse').id, accountId: courant.id, frequency: 'monthly', startDate: day(10), isSubscription: false, emoji: '🎓' });
  recs.push({ ...base, name: 'Loyer', type: 'expense', amount: 48000, categoryId: cat('Loyer').id, accountId: courant.id, frequency: 'monthly', startDate: day(5), isSubscription: false, emoji: '🏠' });
  recs.push({ ...base, name: 'Spotify Étudiant', type: 'expense', amount: 599, categoryId: cat('Abonnements').id, accountId: courant.id, frequency: 'monthly', startDate: day(12), isSubscription: true, emoji: '🎵' });
  recs.push({ ...base, name: 'Netflix', type: 'expense', amount: 799, categoryId: cat('Abonnements').id, accountId: courant.id, frequency: 'monthly', startDate: day(18), isSubscription: true, emoji: '🎬' });
  recs.push({ ...base, name: 'Forfait mobile', type: 'expense', amount: 999, categoryId: cat('Abonnements').id, accountId: courant.id, frequency: 'monthly', startDate: day(8), isSubscription: true, emoji: '📱' });
  recs.push({ ...base, name: 'Salle de sport', type: 'expense', amount: 2499, categoryId: cat('Sport/Santé').id, accountId: courant.id, frequency: 'monthly', startDate: day(2), isSubscription: true, emoji: '💪' });
  recs.push({ ...base, name: 'Pass Navigo étudiant', type: 'expense', amount: 35000, categoryId: cat('Transport').id, accountId: courant.id, frequency: 'yearly', startDate: addDays(today, 40), isSubscription: true, emoji: '🚇' });
  recs.push({ ...base, name: 'Épargne auto', type: 'transfer', amount: 3000, categoryId: null, accountId: courant.id, toAccountId: livret.id, frequency: 'monthly', startDate: day(6), isSubscription: false, emoji: '🏦' });

  await db.recurrings.bulkAdd(recs.map((r): Recurring => ({ skipped: [], lastGenerated: null, ...r, id: uid(), createdAt: now })));

  // Dépenses variables
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
        accountId: name === 'Restau/Fast-food' && r() < 0.25 ? especes.id : courant.id,
        note: pick(notes),
        createdAt: now + i,
        updatedAt: now + i,
      });
    }
  }
  // Un retrait d'espèces par mois
  for (let m = 0; m <= 3; m++) {
    const d = addMonths(day(15), m);
    if (d > today) break;
    txs.push({ id: uid(), type: 'transfer', amount: 4000, date: d, categoryId: null, accountId: courant.id, toAccountId: especes.id, note: 'Retrait DAB', createdAt: now, updatedAt: now });
  }
  await db.transactions.bulkAdd(txs);

  // Objectifs d'épargne
  const permis = uid();
  const pc = uid();
  const voyage = uid();
  await db.goals.bulkAdd([
    { id: permis, name: 'Permis de conduire', emoji: '🚗', color: '#0090FF', target: 150000, targetDate: addMonths(today, 9), createdAt: now },
    { id: pc, name: 'Nouveau PC', emoji: '💻', color: '#8E4EC6', target: 90000, targetDate: addMonths(today, 5), createdAt: now },
    { id: voyage, name: 'Voyage à Barcelone', emoji: '🏖️', color: '#F76B15', target: 40000, targetDate: null, createdAt: now },
  ]);
  const contribs = [
    [permis, 20000, -3], [permis, 10000, -2], [permis, 10000, -1],
    [pc, 15000, -2], [pc, 12000, -1],
    [voyage, 5000, -1], [voyage, 5000, 0],
  ] as const;
  await db.contributions.bulkAdd(
    contribs.map(([goalId, amount, m]) => ({ id: uid(), goalId, amount, date: addMonths(day(7), m + 3) > today ? today : addMonths(day(7), m + 3), note: '', createdAt: now })),
  );

  // Colocation
  const me = uid();
  const lea = uid();
  const hugo = uid();
  const coloc = uid();
  await db.groups.add({ id: coloc, name: 'Coloc rue Victor Hugo', emoji: '🏠', members: [{ id: me, name: 'Moi', isMe: true }, { id: lea, name: 'Léa' }, { id: hugo, name: 'Hugo' }], createdAt: now });
  const shared = [
    ['Courses communes', 6240, me, [me, lea, hugo], -20],
    ['Électricité', 4500, lea, [me, lea, hugo], -15],
    ['Produits ménagers', 1890, hugo, [me, lea, hugo], -9],
    ['Pizza soirée', 3600, me, [me, lea, hugo], -4],
    ['Internet box', 2999, lea, [me, lea, hugo], -2],
  ] as const;
  await db.sharedExpenses.bulkAdd(
    shared.map(([description, amount, paidBy, among, d]) => ({
      id: uid(),
      groupId: coloc,
      kind: 'expense' as const,
      description,
      amount,
      paidBy,
      splits: equalSplits(amount, [...among]),
      date: addDays(today, d),
      createdAt: now,
    })),
  );

  await generateDueRecurring(today);
}
