import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import { buildCandidates, cleanBankLabel, decodeStatement, findDuplicates, parseBankDate, parseStatement } from './statement';

const cat = (id: string, name: string, kind: 'expense' | 'income' = 'expense', incomeSource?: Category['incomeSource']): Category => ({
  id,
  name,
  emoji: '',
  color: '',
  kind,
  budget: null,
  order: 0,
  incomeSource,
});
const cats = [
  cat('courses', 'Courses'),
  cat('resto', 'Restau/Fast-food'),
  cat('loyer', 'Loyer'),
  cat('abos', 'Abonnements'),
  cat('autre', 'Autre'),
  cat('apl', 'APL / CAF', 'income', 'aide'),
  cat('job', 'Job étudiant', 'income', 'job'),
  cat('autre-rev', 'Autre revenu', 'income', 'autre'),
];
const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  type: 'expense',
  amount: 0,
  date: '2026-10-01',
  categoryId: null,
  accountId: 'a',
  note: '',
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

describe('dates bancaires', () => {
  it.each([
    ['05/10/2026', '2026-10-05'],
    ['5/10/26', '2026-10-05'],
    ['2026-10-05', '2026-10-05'],
    ['20261005120000[+1:CET]', '2026-10-05'],
    ['05.10.2026', '2026-10-05'],
    ["05/10'26", '2026-10-05'],
  ])('%s → %s', (raw, iso) => expect(parseBankDate(raw)).toBe(iso));
  it('rejette les dates impossibles', () => {
    expect(parseBankDate('31/02/2026')).toBeNull();
    expect(parseBankDate('Solde')).toBeNull();
  });
});

describe('CSV', () => {
  it('relevé façon Crédit Agricole : lignes d’en-tête, débit / crédit séparés, point-virgule', () => {
    const csv = [
      'Compte de Dépôt carte n° 12345678901;',
      'Solde au 09/10/2026 : 312,45 €',
      '',
      'Date;Libellé;Débit euros;Crédit euros;',
      '08/10/2026;"PAIEMENT PAR CARTE X1234 CARREFOUR CITY PARIS 07/10";23,40;;',
      '06/10/2026;"PRLV SEPA SCI LES LILAS LOYER OCTOBRE";480,00;;',
      '05/10/2026;"VIR SEPA RECU /DE CAF DE PARIS /MOTIF APL";;195,50;',
      '03/10/2026;"PAIEMENT PAR CARTE X1234 MCDONALDS 02/10";8,90;;',
    ].join('\r\n');
    const res = parseStatement(csv, 'releve.csv')!;
    expect(res.format).toBe('csv');
    expect(res.rows).toEqual([
      { date: '2026-10-08', amount: -2340, label: 'PAIEMENT PAR CARTE X1234 CARREFOUR CITY PARIS 07/10' },
      { date: '2026-10-06', amount: -48000, label: 'PRLV SEPA SCI LES LILAS LOYER OCTOBRE' },
      { date: '2026-10-05', amount: 19550, label: 'VIR SEPA RECU /DE CAF DE PARIS /MOTIF APL' },
      { date: '2026-10-03', amount: -890, label: 'PAIEMENT PAR CARTE X1234 MCDONALDS 02/10' },
    ]);
  });
  it('colonne « Montant » unique signée', () => {
    const csv = 'Date opération,Libellé,Montant\n2026-10-04,UBER *TRIP,-12.30\n2026-10-01,SALAIRE OCTOBRE,620.00\n';
    expect(parseStatement(csv)!.rows).toEqual([
      { date: '2026-10-04', amount: -1230, label: 'UBER *TRIP' },
      { date: '2026-10-01', amount: 62000, label: 'SALAIRE OCTOBRE' },
    ]);
  });
  it('montants avec milliers et signe moins dans la colonne débit', () => {
    const csv = 'Date;Libellé;Débit;Crédit\n02/10/2026;ACHAT;-1 234,56;\n';
    expect(parseStatement(csv)!.rows[0].amount).toBe(-123456);
  });
  it('fichier sans tableau reconnu', () => {
    expect(parseStatement('bonjour;monde\n1;2', 'x.txt')).toBeNull();
  });
});

describe('OFX', () => {
  it('lit les transactions (SGML sans balises fermantes)', () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261008
<TRNAMT>-23.40
<FITID>1
<NAME>CARTE X1234 CARREFOUR CITY
<MEMO>PARIS 07/10
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005120000
<TRNAMT>195,50
<NAME>VIR CAF DE PARIS
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const res = parseStatement(ofx, 'releve.ofx')!;
    expect(res.format).toBe('ofx');
    expect(res.rows).toEqual([
      { date: '2026-10-08', amount: -2340, label: 'CARTE X1234 CARREFOUR CITY PARIS 07/10' },
      { date: '2026-10-05', amount: 19550, label: 'VIR CAF DE PARIS' },
    ]);
  });
});

describe('QIF', () => {
  it('lit les transactions', () => {
    const qif = '!Type:Bank\nD08/10/2026\nT-23,40\nPCARREFOUR CITY\n^\nD05/10/2026\nT195,50\nPCAF\nMAPL\n^\n';
    expect(parseStatement(qif, 'releve.qif')!.rows).toEqual([
      { date: '2026-10-08', amount: -2340, label: 'CARREFOUR CITY' },
      { date: '2026-10-05', amount: 19550, label: 'CAF APL' },
    ]);
  });
});

describe('encodage', () => {
  it('lit l’UTF-8 et le Windows-1252 (accents)', () => {
    const latin1 = new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74]); // « Débit » en Windows-1252
    expect(decodeStatement(latin1.buffer)).toBe('Débit');
    expect(decodeStatement(new TextEncoder().encode('Crédit').buffer as ArrayBuffer)).toBe('Crédit');
  });
});

describe('nettoyage des libellés', () => {
  it.each([
    ['PAIEMENT PAR CARTE X1234 CARREFOUR CITY PARIS 07/10', 'Carrefour City Paris'],
    ['CARTE X5678 05/10 MCDONALDS', 'Mcdonalds'],
    ['PRLV SEPA NETFLIX.COM REF:ABC123', 'Netflix'],
    ['VIR SEPA RECU /DE CAF DE PARIS /MOTIF APL', 'Caf De Paris'],
    ['RETRAIT DAB 05/10 PARIS', 'Paris'],
  ])('%s → %s', (raw, clean) => expect(cleanBankLabel(raw)).toBe(clean));
});

describe('doublons', () => {
  it('reconnaît une opération déjà saisie (même montant, ± 3 jours), une seule fois', () => {
    const existing = [tx({ amount: 2340, date: '2026-10-07', source: 'applepay' }), tx({ amount: 48000, date: '2026-10-05', recurringId: 'r' })];
    const rows = [
      { date: '2026-10-08', amount: -2340, label: 'CARREFOUR' }, // Apple Pay débité le lendemain
      { date: '2026-10-08', amount: -2340, label: 'CARREFOUR' }, // deuxième achat identique : nouveau
      { date: '2026-10-06', amount: -48000, label: 'LOYER' }, // déjà généré par la récurrence
      { date: '2026-10-20', amount: -48000, label: 'LOYER' }, // trop loin : nouveau
    ];
    expect(findDuplicates(rows, existing)).toEqual([true, false, true, false]);
  });
  it('ne confond pas un revenu et une dépense du même montant', () => {
    expect(findDuplicates([{ date: '2026-10-05', amount: 19550, label: 'CAF' }], [tx({ amount: 19550, date: '2026-10-05' })])).toEqual([false]);
  });
});

describe('préparation de l’import', () => {
  it('catégorise, repère les doublons et trie du plus récent au plus ancien', () => {
    const rows = [
      { date: '2026-10-03', amount: -890, label: 'PAIEMENT PAR CARTE X1234 MCDONALDS 02/10' },
      { date: '2026-10-05', amount: 19550, label: 'VIR SEPA RECU /DE CAF DE PARIS /MOTIF APL' },
      { date: '2026-10-08', amount: -2340, label: 'PAIEMENT PAR CARTE X1234 CARREFOUR CITY PARIS 07/10' },
      { date: '2026-10-06', amount: -1500, label: 'PAIEMENT PAR CARTE X1234 SARL DUPONT' },
    ];
    expect(buildCandidates([{ date: '2026-10-05', amount: -48000, label: 'PRLV SEPA SCI LES LILAS LOYER' }], [], cats)[0].categoryId).toBe('loyer');
    const c = buildCandidates(rows, [tx({ amount: 890, date: '2026-10-02' })], cats);
    expect(c.map((x) => x.date)).toEqual(['2026-10-08', '2026-10-06', '2026-10-05', '2026-10-03']);
    expect(c.map((x) => x.categoryId)).toEqual(['courses', 'autre', 'apl', 'resto']);
    expect(c.map((x) => x.type)).toEqual(['expense', 'expense', 'income', 'expense']);
    expect(c.map((x) => x.duplicate)).toEqual([false, false, false, true]);
    expect(c[0].note).toBe('Carrefour City Paris');
  });
});
