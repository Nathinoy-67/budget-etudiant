import { describe, expect, it } from 'vitest';
import type { Category } from '../types';
import { guessCategory, merchantKey, normalizeMerchant, parseIncomingPayment, prettyMerchant } from './merchant';

const cat = (id: string, name: string, archived = false): Category => ({ id, name, emoji: '', color: '', kind: 'expense', budget: null, order: 0, archived });
const cats = [
  cat('courses', 'Courses'),
  cat('resto', 'Restau/Fast-food'),
  cat('transport', 'Transport'),
  cat('abos', 'Abonnements'),
  cat('sante', 'Sport/Santé'),
  cat('vet', 'Vêtements'),
  cat('autre', 'Autre'),
];

describe('normalisation des commerçants', () => {
  it('retire accents, majuscules et ponctuation', () => {
    expect(normalizeMerchant('CARREFOUR CITY - Paris 11ème')).toBe('carrefour city paris 11eme');
    expect(merchantKey('Boulangerie Ange, Lyon')).toBe('boulangerie ange');
  });
  it('met en forme les noms en majuscules', () => {
    expect(prettyMerchant('CARREFOUR CITY')).toBe('Carrefour City');
    expect(prettyMerchant("MCDONALD'S")).toBe("Mcdonald's");
    expect(prettyMerchant('Zara Home')).toBe('Zara Home');
  });
});

describe('guessCategory', () => {
  it.each([
    ['CARREFOUR CITY PARIS', 'courses'],
    ['Lidl', 'courses'],
    ["MCDONALD'S", 'resto'],
    ['UBER EATS', 'resto'],
    ['UBER *TRIP', 'transport'],
    ['SNCF CONNECT', 'transport'],
    ['NETFLIX.COM', 'abos'],
    ['PHARMACIE DU CENTRE', 'sante'],
    ['ZARA', 'vet'],
  ])('%s → %s', (merchant, expected) => {
    expect(guessCategory(merchant, cats)).toBe(expected);
  });

  it('ne confond pas un mot-clé inclus dans un autre mot', () => {
    // "bar" ne doit pas matcher "barbara" ; "ter" ne doit pas matcher "intermarche"
    expect(guessCategory('BARBARA COIFFURE', cats)).toBeNull();
    expect(guessCategory('INTERMARCHE', cats)).toBe('courses');
  });
  it('privilégie les règles apprises', () => {
    expect(guessCategory('CARREFOUR CITY 75011', cats, { 'carrefour city': 'resto' })).toBe('resto');
  });
  it('ignore une règle vers une catégorie archivée', () => {
    expect(guessCategory('CARREFOUR CITY', [...cats, cat('old', 'Old', true)], { 'carrefour city': 'old' })).toBe('courses');
  });
  it('inconnu → null', () => {
    expect(guessCategory('SARL DUPONT', cats)).toBeNull();
  });
});

describe('parseIncomingPayment', () => {
  it.each([
    ['?applepay=12%2C40%C2%A0%E2%82%AC%7CCarrefour%20City', 1240, 'Carrefour City'],
    ['?applepay=12,40 €|McDonald\'s', 1240, "McDonald's"],
    ['?applepay=€12.40|Lidl', 1240, 'Lidl'],
    ['?applepay=12,40 EUR|Lidl', 1240, 'Lidl'],
    ['?applepay=-3,50 €|RATP', 350, 'RATP'],
    ['?applepay=1 234,56 €|Apple Store', 123456, 'Apple Store'],
    ['?montant=9,99&marchand=Netflix', 999, 'Netflix'],
    ['?applepay=12.4|CARREFOUR', 1240, 'CARREFOUR'],
    ['?applepay=7|SNCF', 700, 'SNCF'],
    ['?applepay=7,20 €|', 720, 'Paiement Apple Pay'],
    ['?applepay=7,20 €|Café | Bar', 720, 'Café | Bar'],
  ])('%s', (search, amount, merchant) => {
    expect(parseIncomingPayment(search)).toEqual({ amount, merchant });
  });
  it('rejette les liens sans montant valide', () => {
    expect(parseIncomingPayment('')).toBeNull();
    expect(parseIncomingPayment('?applepay=abc|Lidl')).toBeNull();
    expect(parseIncomingPayment('?applepay=0,00 €|Lidl')).toBeNull();
  });
});
