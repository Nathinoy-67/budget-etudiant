import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  diffMonths,
  getPeriod,
  isValidISO,
  periodLength,
  shiftPeriod,
  todayISO,
} from './dates';

describe('todayISO (Europe/Paris)', () => {
  it("utilise l'heure de Paris et non l'UTC", () => {
    // 22 h 30 UTC le 31 déc. = 23 h 30 à Paris (hiver) → encore le 31
    expect(todayISO(new Date('2025-12-31T22:30:00Z'))).toBe('2025-12-31');
    // 23 h 30 UTC le 31 déc. = 0 h 30 le 1er janv. à Paris
    expect(todayISO(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    // été (UTC+2) : 22 h 30 UTC = 0 h 30 le lendemain
    expect(todayISO(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
  });
});

describe('daysInMonth', () => {
  it('gère 28/29/30/31 jours', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('addDays / diffDays', () => {
  it("traverse les changements d'heure sans décalage", () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
  });
  it("change d'année", () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('addMonths', () => {
  it('borne au dernier jour du mois', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });
  it("respecte le jour d'ancrage", () => {
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
  it('recule et change d’année', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('diffMonths', () => {
  it('compte les mois pleins', () => {
    expect(diffMonths('2026-01-15', '2026-03-14')).toBe(1);
    expect(diffMonths('2026-01-15', '2026-03-15')).toBe(2);
    expect(diffMonths('2026-01-31', '2026-02-28')).toBe(1);
    expect(diffMonths('2026-10-07', '2027-06-30')).toBe(8);
  });
});

describe('getPeriod', () => {
  it('mois calendaire par défaut', () => {
    expect(getPeriod('2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(getPeriod('2028-02-29')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('commence le 5 du mois (revenus le 5)', () => {
    expect(getPeriod('2026-10-07', 5)).toEqual({ start: '2026-10-05', end: '2026-11-04' });
    expect(getPeriod('2026-10-04', 5)).toEqual({ start: '2026-09-05', end: '2026-10-04' });
    expect(getPeriod('2026-01-02', 5)).toEqual({ start: '2025-12-05', end: '2026-01-04' });
  });
  it('jour de début 31 borné aux mois courts', () => {
    expect(getPeriod('2026-02-28', 31)).toEqual({ start: '2026-02-28', end: '2026-03-30' });
    expect(getPeriod('2026-04-30', 31)).toEqual({ start: '2026-04-30', end: '2026-05-30' });
    expect(getPeriod('2026-04-29', 31)).toEqual({ start: '2026-03-31', end: '2026-04-29' });
  });
  it('les périodes se suivent sans trou ni chevauchement', () => {
    for (const startDay of [1, 5, 15, 28, 29, 30, 31]) {
      let p = getPeriod('2026-01-10', startDay);
      for (let i = 0; i < 24; i++) {
        const next = shiftPeriod(p, 1, startDay);
        expect(next.start).toBe(addDays(p.end, 1));
        expect(periodLength(p)).toBeGreaterThanOrEqual(28);
        expect(periodLength(p)).toBeLessThanOrEqual(31);
        p = next;
      }
    }
  });
  it('shiftPeriod recule aussi', () => {
    expect(shiftPeriod(getPeriod('2026-01-10'), -1)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('isValidISO', () => {
  it('valide les dates', () => {
    expect(isValidISO('2026-02-29')).toBe(false);
    expect(isValidISO('2028-02-29')).toBe(true);
    expect(isValidISO('2026-13-01')).toBe(false);
    expect(isValidISO('7/10/2026')).toBe(false);
  });
});
