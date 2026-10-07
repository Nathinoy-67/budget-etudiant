import { describe, expect, it } from 'vitest';
import { centsToInput, formatMoney, parseAmount, splitEqually } from './money';

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.5', 1250],
    ['0,99', 99],
    [',5', 50],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['12 €', 1200],
    ['-3,2', -320],
    ['0,105', 11],
    ['0,104', 10],
    ['19,999', 2000],
  ])('%s → %i centimes', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '12,3a', ',', '-'])('rejette « %s »', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('évite les erreurs de flottants (0,1 + 0,2)', () => {
    expect(parseAmount('0,1')! + parseAmount('0,2')!).toBe(30);
  });
});

describe('formatMoney', () => {
  const norm = (s: string) => s.replace(/[  ]/g, ' ');
  it('formate en euros à la française', () => {
    expect(norm(formatMoney(123456))).toBe('1 234,56 €');
    expect(norm(formatMoney(5))).toBe('0,05 €');
  });
  it('gère le signe', () => {
    expect(norm(formatMoney(-1250))).toBe('−12,50 €');
    expect(norm(formatMoney(1250, { sign: true }))).toBe('+12,50 €');
  });
  it('mode compact sans centimes inutiles', () => {
    expect(norm(formatMoney(1200, { compact: true }))).toBe('12 €');
    expect(norm(formatMoney(1250, { compact: true }))).toBe('12,50 €');
  });
});

describe('centsToInput', () => {
  it('retire les zéros inutiles', () => {
    expect(centsToInput(1200)).toBe('12');
    expect(centsToInput(1250)).toBe('12,5');
    expect(centsToInput(1205)).toBe('12,05');
    expect(centsToInput(-99)).toBe('-0,99');
  });
});

describe('splitEqually', () => {
  it('répartit le reste au centime', () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqually(1000, 3).reduce((a, b) => a + b)).toBe(1000);
    expect(splitEqually(1, 4)).toEqual([1, 0, 0, 0]);
    expect(splitEqually(500, 0)).toEqual([]);
  });
});
