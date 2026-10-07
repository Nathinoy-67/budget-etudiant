import type { Category, ID } from '../types';
import { parseAmount } from './money';

/** "CARREFOUR CITY - Paris 11" → "carrefour city paris 11" (minuscules, sans accents ni ponctuation). */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Clé d'apprentissage : les deux premiers mots ("carrefour city paris 11" → "carrefour city"). */
export function merchantKey(name: string): string {
  return normalizeMerchant(name).split(' ').slice(0, 2).join(' ');
}

/** "CARREFOUR CITY" → "Carrefour City" (les noms Apple Pay arrivent souvent en majuscules). */
export function prettyMerchant(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean !== clean.toUpperCase()) return clean;
  return clean.toLowerCase().replace(/(^|[\s\-/&.])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Mots-clés → nom de catégorie par défaut. Comparaison sur des mots entiers. */
const KEYWORDS: Record<string, string[]> = {
  Courses: [
    'carrefour', 'leclerc', 'lidl', 'aldi', 'auchan', 'intermarche', 'monoprix', 'monop', 'franprix', 'casino', 'super u',
    'hyper u', 'u express', 'systeme u', 'picard', 'biocoop', 'netto', 'spar', 'naturalia', 'g20', 'coccinelle', 'cora',
    'grand frais', 'leader price', 'match', 'vival', 'proxi', 'marche', 'primeur', 'epicerie', 'la vie claire', 'action',
  ],
  'Restau/Fast-food': [
    'mcdonald', 'mcdonalds', 'mc donald', 'mcdo', 'burger king', 'kfc', 'quick', 'subway', 'domino', 'dominos', 'pizza',
    'pizzeria', 'kebab', 'tacos', 'o tacos', 'starbucks', 'paul', 'boulangerie', 'columbus', 'five guys', 'sushi', 'crous',
    'uber eats', 'ubereats', 'deliveroo', 'just eat', 'brioche doree', 'pret a manger', 'cafe', 'coffee', 'restaurant',
    'brasserie', 'bagel', 'poke', 'pokawa', 'big fernand', 'del arte', 'buffalo grill', 'hippopotamus', 'courtepaille',
    'boulanger', 'patisserie', 'bar', 'pub',
  ],
  Transport: [
    'sncf', 'ratp', 'uber', 'bolt', 'heetch', 'blablacar', 'flixbus', 'ouigo', 'tgv', 'ter', 'total', 'totalenergies',
    'esso', 'shell', 'bp', 'avia', 'lime', 'dott', 'tier', 'voi', 'navigo', 'tcl', 'tisseo', 'transdev', 'keolis', 'rtm',
    'tan', 'star', 'parking', 'indigo', 'effia', 'peage', 'vinci autoroutes', 'sanef', 'aprr', 'velib', 'free now',
  ],
  Abonnements: [
    'netflix', 'spotify', 'deezer', 'disney', 'apple com bill', 'itunes', 'icloud', 'amazon prime', 'prime video', 'canal',
    'free mobile', 'sfr', 'orange', 'bouygues', 'sosh', 'red by sfr', 'youtube', 'chatgpt', 'openai', 'crunchyroll',
    'xbox game pass', 'playstation plus', 'twitch', 'molotov', 'audible',
  ],
  'Sport/Santé': [
    'pharmacie', 'pharma', 'decathlon', 'basic fit', 'basic', 'fitness park', 'on air', 'neoness', 'keep cool', 'doctolib',
    'medecin', 'dentiste', 'opticien', 'laboratoire', 'go sport', 'intersport', 'piscine', 'climb', 'escalade',
  ],
  Loisirs: [
    'fnac', 'cinema', 'ugc', 'pathe', 'gaumont', 'mk2', 'cgr', 'steam', 'playstation', 'nintendo', 'xbox', 'bowling',
    'micromania', 'cultura', 'ticketmaster', 'fnac spectacles', 'escape', 'laser game', 'musee', 'concert', 'boite',
  ],
  Vêtements: [
    'zara', 'h m', 'hm', 'kiabi', 'primark', 'uniqlo', 'celio', 'jules', 'bershka', 'pull bear', 'vinted', 'nike', 'adidas',
    'foot locker', 'courir', 'shein', 'mango', 'bershka', 'stradivarius', 'jd sports', 'snipes', 'galeries lafayette',
    'printemps', 'zalando', 'asos', 'the kooples', 'sezane', 'levi',
  ],
  Études: ['gibert', 'librairie', 'bureau vallee', 'papeterie', 'office depot', 'copy', 'reprographie', 'universite', 'bu'],
};

/** Index précalculé : [mot-clé normalisé, nom de catégorie], les plus longs d'abord ("uber eats" avant "uber"). */
const KEYWORD_INDEX: [string, string][] = Object.entries(KEYWORDS)
  .flatMap(([cat, words]) => words.map((w) => [normalizeMerchant(w), cat] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Devine la catégorie d'un commerçant :
 * 1. règle apprise (l'utilisateur a corrigé ce commerçant auparavant) ;
 * 2. mots-clés connus (Carrefour → Courses…) ;
 * 3. null si inconnu (l'appelant choisit une catégorie de repli).
 */
export function guessCategory(merchant: string, categories: Category[], learned: Record<string, ID> = {}): ID | null {
  const active = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const learnedId = learned[merchantKey(merchant)];
  if (learnedId && active.some((c) => c.id === learnedId)) return learnedId;

  const padded = ` ${normalizeMerchant(merchant)} `;
  for (const [word, catName] of KEYWORD_INDEX) {
    if (!padded.includes(` ${word} `)) continue;
    const cat = active.find((c) => c.name === catName);
    if (cat) return cat.id;
  }
  return null;
}

export interface IncomingPayment {
  amount: number;
  merchant: string;
}

/**
 * Lit un paiement transmis par le raccourci iOS : `?applepay=<montant>|<commerçant>`
 * (ou `?montant=…&marchand=…`). Le montant arrive au format de l'iPhone : "12,40 €", "12,40 EUR", "€12.40", "-12,40 €".
 */
export function parseIncomingPayment(search: string): IncomingPayment | null {
  const params = new URLSearchParams(search);
  let rawAmount = params.get('montant');
  let merchant = params.get('marchand');
  const combined = params.get('applepay');
  if (combined && combined.includes('|')) {
    const i = combined.indexOf('|');
    rawAmount = combined.slice(0, i);
    merchant = combined.slice(i + 1);
  }
  if (rawAmount == null) return null;
  const cleaned = rawAmount.replace(/[A-Za-z]/g, '').replace(/[^\d.,\s  -]/g, '');
  const cents = parseAmount(cleaned);
  if (cents == null || cents === 0) return null;
  return { amount: Math.abs(cents), merchant: (merchant ?? '').trim() || 'Paiement Apple Pay' };
}
