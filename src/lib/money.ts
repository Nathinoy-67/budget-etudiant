import type { Cents } from '../types';

/**
 * Convertit une saisie utilisateur en centimes.
 * Accepte "12", "12,5", "12.50", "1 234,56", "1.234,56", "12 €", "-3,2".
 * Retourne null si la saisie est invalide.
 */
export function parseAmount(input: string): Cents | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[\s  €$£]/g, '').replace(/^\+/, '');
  if (!s) return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const sepIndex = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = s;
  let decPart = '';
  if (sepIndex >= 0) {
    const sepChar = s[sepIndex];
    const after = s.slice(sepIndex + 1);
    const occurrences = s.split(sepChar).length - 1;
    const hasBoth = s.includes(',') && s.includes('.');
    // Séparateur de milliers : répété ("1.234.567"), ou point unique suivi de 3 chiffres ("1.234").
    // La virgule seule est toujours décimale (usage français).
    const isThousands =
      !hasBoth && (occurrences > 1 || (sepChar === '.' && after.length === 3 && sepIndex > 0));
    if (isThousands) {
      intPart = s.replace(/[.,]/g, '');
    } else {
      intPart = s.slice(0, sepIndex).replace(/[.,]/g, '');
      decPart = after;
    }
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  if (intPart === '' && decPart === '') return null;
  if (decPart.length > 2) {
    // arrondi au centime
    const third = Number(decPart[2]);
    decPart = decPart.slice(0, 2);
    let cents = Number(intPart || '0') * 100 + Number(decPart);
    if (third >= 5) cents += 1;
    return negative ? -cents : cents;
  }
  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

const formatters = new Map<string, Intl.NumberFormat>();
function getFormatter(currency: string, decimals: boolean): Intl.NumberFormat {
  const key = `${currency}-${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

let currentCurrency = 'EUR';
export function setCurrency(c: string) {
  currentCurrency = c;
}
export function getCurrency() {
  return currentCurrency;
}

export interface FormatOptions {
  /** Affiche "+" devant les montants positifs. */
  sign?: boolean;
  /** Masque les centimes quand ils valent 0 (ex. 12 € au lieu de 12,00 €). */
  compact?: boolean;
  currency?: string;
}

/** Formate des centimes en "1 234,56 €". */
export function formatMoney(cents: Cents, opts: FormatOptions = {}): string {
  const currency = opts.currency ?? currentCurrency;
  const decimals = !(opts.compact && cents % 100 === 0);
  const abs = getFormatter(currency, decimals).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${abs}`;
  if (opts.sign && cents > 0) return `+${abs}`;
  return abs;
}

/** Centimes → texte éditable "12,5" (sans symbole). */
export function centsToInput(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const c = abs % 100;
  const s = c === 0 ? String(euros) : `${euros},${String(c).padStart(2, '0').replace(/0$/, '')}`;
  return neg ? `-${s}` : s;
}

/** Répartit un total en n parts égales au centime près (le reste va aux premières parts). */
export function splitEqually(total: Cents, n: number): Cents[] {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < Math.abs(remainder) ? Math.sign(remainder) : 0));
}

/** Pourcentage arrondi, sans division par zéro. */
export function percent(part: number, total: number): number {
  if (!total || total <= 0) return part > 0 ? 100 : 0;
  return (part / total) * 100;
}
