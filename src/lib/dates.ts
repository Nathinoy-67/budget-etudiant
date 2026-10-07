import type { ISODate } from '../types';

/**
 * Toutes les dates métier sont des chaînes "AAAA-MM-JJ" interprétées dans le fuseau Europe/Paris.
 * Les calculs se font en UTC sur ces dates "nues" : aucun décalage d'heure d'été ne peut
 * faire glisser un jour.
 */
export const TIME_ZONE = 'Europe/Paris';

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Date du jour à Paris (et non en UTC : à 0 h 30 à Paris, on est bien "aujourd'hui"). */
export function todayISO(now: Date = new Date()): ISODate {
  return isoFormatter.format(now);
}

/** Heure "HH:MM" actuelle à Paris. */
export function nowTimeParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

export function isValidISO(d: unknown): d is ISODate {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const { y, m, day } = parts(d);
  return m >= 1 && m <= 12 && day >= 1 && day <= daysInMonth(y, m);
}

export function parts(d: ISODate): { y: number; m: number; day: number } {
  return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) };
}

export function toISO(y: number, m: number, day: number): ISODate {
  // normalise les mois hors bornes (m = 13 → janvier de l'année suivante)
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Nombre de jours dans un mois (m de 1 à 12), années bissextiles comprises. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(d: ISODate): number {
  const { y, m, day } = parts(d);
  return Date.UTC(y, m - 1, day);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * 86_400_000);
}

/** Jours de a à b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/**
 * Ajoute n mois en conservant le jour d'ancrage, borné au dernier jour du mois.
 * Ex. 31 janv. + 1 mois → 28/29 févr. ; avec anchorDay = 31, 28 févr. + 1 mois → 31 mars.
 */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const { y, m, day } = parts(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const target = anchorDay ?? day;
  return toISO(ny, nm, Math.min(target, daysInMonth(ny, nm)));
}

/** 0 = dimanche … 6 = samedi */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** Nombre de mois "pleins" entre deux dates (ex. 15 janv. → 14 mars = 1, → 15 mars = 2). */
export function diffMonths(a: ISODate, b: ISODate): number {
  const pa = parts(a);
  const pb = parts(b);
  let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  // le jour d'ancrage est borné au dernier jour du mois (31 janv. → 28 févr. = 1 mois)
  const anchor = Math.min(pa.day, daysInMonth(pb.y, pb.m));
  if (months > 0 && pb.day < anchor) months -= 1;
  if (months < 0 && pb.day > anchor) months += 1;
  return months;
}

export interface Period {
  start: ISODate;
  /** inclus */
  end: ISODate;
}

/** Premier jour effectif d'une période dans un mois donné (borné : 31 → 30 en avril). */
function effectiveStart(y: number, m: number, startDay: number): ISODate {
  return toISO(y, m, Math.min(Math.max(1, startDay), daysInMonth(y, m)));
}

/**
 * Période budgétaire contenant `ref`, selon le jour de début choisi.
 * Ex. startDay = 5 : du 5 octobre au 4 novembre inclus.
 */
export function getPeriod(ref: ISODate, startDay = 1): Period {
  const { y, m } = parts(ref);
  let start = effectiveStart(y, m, startDay);
  if (ref < start) start = effectiveStart(y, m - 1, startDay);
  const sp = parts(start);
  const nextStart = effectiveStart(sp.y, sp.m + 1, startDay);
  return { start, end: addDays(nextStart, -1) };
}

/** Période décalée de n mois. */
export function shiftPeriod(p: Period, n: number, startDay = 1): Period {
  const { y, m } = parts(p.start);
  return getPeriod(effectiveStart(y, m + n, startDay), startDay);
}

export function periodLength(p: Period): number {
  return diffDays(p.start, p.end) + 1;
}

export function inPeriod(d: ISODate, p: Period): boolean {
  return d >= p.start && d <= p.end;
}

// ---------- Affichage ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' });
    fmtCache.set(key, f);
  }
  return f;
}

const asDate = (d: ISODate) => new Date(toUTC(d));

/** "lundi 7 octobre" */
export function formatLongDate(d: ISODate): string {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(asDate(d));
}
/** "7 oct." ou "7 oct. 2025" si autre année */
export function formatShortDate(d: ISODate, today?: ISODate): string {
  const sameYear = today ? today.slice(0, 4) === d.slice(0, 4) : true;
  return fmt(sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(
    asDate(d),
  );
}
/** "7 octobre 2026" */
export function formatFullDate(d: ISODate): string {
  return fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(asDate(d));
}
/** "octobre 2026" */
export function formatMonthYear(d: ISODate): string {
  return fmt({ month: 'long', year: 'numeric' }).format(asDate(d));
}
/** "oct." */
export function formatMonthShort(d: ISODate): string {
  return fmt({ month: 'short' }).format(asDate(d));
}

/** "Aujourd'hui", "Hier", "Demain" ou "lundi 7 octobre" */
export function relativeDayLabel(d: ISODate, today: ISODate): string {
  const diff = diffDays(today, d);
  if (diff === 0) return "Aujourd'hui";
  if (diff === -1) return 'Hier';
  if (diff === 1) return 'Demain';
  const label = formatLongDate(d);
  const withYear = d.slice(0, 4) !== today.slice(0, 4) ? `${label} ${d.slice(0, 4)}` : label;
  return withYear.charAt(0).toUpperCase() + withYear.slice(1);
}

/** Libellé de période : "octobre 2026" si elle commence le 1er, sinon "5 oct. → 4 nov." */
export function periodLabel(p: Period): string {
  if (p.start.endsWith('-01')) {
    const l = formatMonthYear(p.start);
    return l.charAt(0).toUpperCase() + l.slice(1);
  }
  return `${formatShortDate(p.start)} → ${formatShortDate(p.end)}`;
}

/** "dans 3 jours", "demain", "aujourd'hui", "il y a 2 jours" */
export function inDaysLabel(d: ISODate, today: ISODate): string {
  const n = diffDays(today, d);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  if (n > 1) return `dans ${n} jours`;
  return `il y a ${-n} jours`;
}
