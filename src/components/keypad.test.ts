import { describe, expect, it } from 'vitest';
import { applyKey } from './Keypad';

const type = (keys: string[]) => keys.reduce((v, k) => applyKey(v, k), '');

describe('pavé numérique', () => {
  it('saisit un montant à virgule', () => {
    expect(type(['1', '2', ',', '5'])).toBe('12,5');
  });
  it('limite à 2 décimales et une seule virgule', () => {
    expect(type(['1', ',', '2', '3', '4'])).toBe('1,23');
    expect(type(['1', ',', ',', '2'])).toBe('1,2');
  });
  it('ajoute un 0 devant une virgule initiale', () => {
    expect(type([',', '5'])).toBe('0,5');
  });
  it('pas de zéros inutiles en tête', () => {
    expect(type(['0', '0', '7'])).toBe('7');
  });
  it('efface', () => {
    expect(type(['1', '2', 'back'])).toBe('1');
    expect(type(['back'])).toBe('');
  });
  it('limite la longueur', () => {
    expect(type(Array(10).fill('9'))).toBe('9999999');
  });
});
