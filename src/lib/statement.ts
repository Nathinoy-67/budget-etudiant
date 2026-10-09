import type { Category, Cents, ID, ISODate, Transaction } from '../types';
import { diffDays, isValidISO, toISO } from './dates';
import { parseAmount } from './money';
import { guessCategory, normalizeMerchant, prettyMerchant } from './merchant';

/**
 * Lecture des relevés bancaires exportés depuis l'espace client (Crédit Agricole et autres) :
 * CSV (séparateur ; ou ,), OFX et QIF. Lecture tolérante : on cherche les colonnes par leur nom.
 */

export interface StatementRow {
  date: ISODate;
  /** Montant signé : négatif = dépense, positif = revenu. */
  amount: Cents;
  /** Libellé brut de la banque. */
  label: string;
}

export type StatementFormat = 'csv' | 'ofx' | 'qif';

export interface ParsedStatement {
  format: StatementFormat;
  rows: StatementRow[];
}

// ---------- Dates ----------

/** "05/10/2026", "05/10/26", "2026-10-05", "20261005", "05.10.2026", "5/10/2026" → ISO. */
export function parseBankDate(raw: string): ISODate | null {
  const s = raw.trim().replace(/^"|"$/g, '');
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return check(toISO(+m[1], +m[2], +m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX : 20261005120000
  if (m) return check(toISO(+m[1], +m[2], +m[3]));
  m = s.match(/^(\d{1,2})[/.\-'](\d{1,2})[/.\-'](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return check(toISO(year, +m[2], +m[1]));
  }
  return null;
}

function check(d: ISODate): ISODate | null {
  return isValidISO(d) ? d : null;
}

// ---------- CSV ----------

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const norm = (s: string) => normalizeMerchant(s);

function parseCsv(text: string): StatementRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  // La ligne d'en-tête est la première qui contient « date » et un libellé ou un montant
  const headerIndex = lines.findIndex((l) => {
    const n = norm(l);
    return /\bdate\b/.test(n) && /(libelle|label|description|operation|montant|debit|credit|amount)/.test(n);
  });
  if (headerIndex < 0) return [];
  const headerLine = lines[headerIndex];
  const sep = [';', ',', '\t'].sort((a, b) => headerLine.split(b).length - headerLine.split(a).length)[0];
  const headers = splitCsvLine(headerLine, sep).map(norm);

  const find = (...patterns: RegExp[]) => headers.findIndex((h) => patterns.some((p) => p.test(h)));
  const iDate = find(/^date( de)? (operation|comptabilisation)$/, /^date$/, /^date/);
  const iLabel = find(/libelle/, /label/, /description/, /^operation$/, /nature/);
  const iDebit = find(/debit/);
  const iCredit = find(/credit/);
  const iAmount = find(/^montant/, /amount/);
  if (iDate < 0 || iLabel < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) return [];

  const rows: StatementRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitCsvLine(line, sep);
    const date = parseBankDate(cells[iDate] ?? '');
    if (!date) continue;
    let amount: Cents | null = null;
    if (iDebit >= 0 || iCredit >= 0) {
      const debit = iDebit >= 0 && cells[iDebit] ? parseAmount(cells[iDebit]) : null;
      const credit = iCredit >= 0 && cells[iCredit] ? parseAmount(cells[iCredit]) : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (amount == null && iAmount >= 0 && cells[iAmount]) amount = parseAmount(cells[iAmount]);
    if (!amount) continue;
    // Libellé parfois réparti sur plusieurs colonnes / lignes (retours à la ligne dans les cellules)
    const label = (cells[iLabel] ?? '').replace(/\s+/g, ' ').trim();
    rows.push({ date, amount, label });
  }
  return rows;
}

// ---------- OFX ----------

function ofxField(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : '';
}

function parseOfx(text: string): StatementRow[] {
  const rows: StatementRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = parseBankDate(ofxField(block, 'DTPOSTED') || ofxField(block, 'DTUSER'));
    const amount = parseAmount(ofxField(block, 'TRNAMT'));
    if (!date || !amount) continue;
    const name = ofxField(block, 'NAME');
    const memo = ofxField(block, 'MEMO');
    const label = [name, memo && !name.includes(memo) ? memo : ''].filter(Boolean).join(' ');
    rows.push({ date, amount, label });
  }
  return rows;
}

// ---------- QIF ----------

function parseQif(text: string): StatementRow[] {
  const rows: StatementRow[] = [];
  let date: ISODate | null = null;
  let amount: Cents | null = null;
  let payee = '';
  let memo = '';
  for (const line of text.split(/\r?\n/)) {
    const code = line[0];
    const value = line.slice(1).trim();
    if (code === 'D') date = parseBankDate(value);
    else if (code === 'T' || code === 'U') amount = parseAmount(value);
    else if (code === 'P') payee = value;
    else if (code === 'M') memo = value;
    else if (code === '^') {
      if (date && amount) rows.push({ date, amount, label: [payee, memo].filter(Boolean).join(' ') });
      date = null;
      amount = null;
      payee = '';
      memo = '';
    }
  }
  return rows;
}

/** Détecte le format et lit le relevé. */
export function parseStatement(text: string, filename = ''): ParsedStatement | null {
  const clean = text.replace(/^﻿/, '');
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'ofx' || /<OFX>|<STMTTRN>/i.test(clean)) return { format: 'ofx', rows: parseOfx(clean) };
  if (ext === 'qif' || /^!Type:/im.test(clean)) return { format: 'qif', rows: parseQif(clean) };
  const rows = parseCsv(clean);
  return rows.length || ext === 'csv' ? { format: 'csv', rows } : null;
}

/** Décode un fichier en UTF-8, ou en Windows-1252 (encodage fréquent des exports bancaires). */
export function decodeStatement(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

// ---------- Libellés ----------

/**
 * Nettoie un libellé bancaire pour n'en garder que le commerçant :
 * "PAIEMENT PAR CARTE X1234 CARREFOUR CITY PARIS 05/10" → "Carrefour City Paris".
 */
export function cleanBankLabel(label: string): string {
  let s = ` ${label.replace(/\s+/g, ' ').trim()} `.replace(/\b\d{2}[/.]\d{2}([/.]\d{2,4})?\b/g, ' '); // dates
  // Virements SEPA : « … /DE CAF DE PARIS /MOTIF APL » → on garde l'émetteur
  const from = s.match(/\/DE:?\s+([^/]+)/i);
  if (from) s = ` ${from[1]} `;
  s = s.replace(/\/(MOTIF|REF|ID|DATE|LIB)\b[^/]*/gi, ' ').replace(/\//g, ' ');
  s = s.replace(/\.(COM|FR|NET|EU)\b/gi, ' ');
  const prefixes = [
    /\bPAIEMENT PAR CARTE\b/i,
    /\bPAIEMENT CB\b/i,
    /\bACHAT CB\b/i,
    /\bCARTE\b/i,
    /\bCB\b/i,
    /\bPRLV SEPA\b/i,
    /\bPRELEVEMENT( SEPA)?\b/i,
    /\bPRELEVMNT\b/i,
    /\bVIR(EMENT)?( SEPA)?( INST(ANTANE)?)?( RECU| EMIS)?\b/i,
    /\bEN VOTRE FAVEUR\b/i,
    /\bDE ?:/i,
    /\bPOUR ?:/i,
    /\bRETRAIT (DAB|GAB)\b/i,
  ];
  for (const p of prefixes) s = s.replace(p, ' ');
  s = s
    .replace(/\bX\d{4}\b/gi, ' ') // numéro de carte masqué
    .replace(/\b\d{2}[/.]\d{2}([/.]\d{2,4})?\b/g, ' ') // dates
    .replace(/\b(REF|ID|MDT|RUM|ICS|NPY|LIB)[: ]\S*/gi, ' ') // références SEPA
    .replace(/\b\d{6,}\b/g, ' ') // longues références numériques
    .replace(/\s+/g, ' ')
    .trim();
  return s ? prettyMerchant(s) : prettyMerchant(label.trim());
}

/** Catégorie de revenu d'après le libellé (CAF → APL, salaire → job…). */
export function guessIncomeCategory(label: string, categories: Category[]): ID | null {
  const n = ` ${normalizeMerchant(label)} `;
  const income = categories.filter((c) => c.kind === 'income' && !c.archived);
  const bySource = (src: string) => income.find((c) => c.incomeSource === src)?.id ?? null;
  if (/ (caf|apl|allocation|alloc) /.test(n)) return bySource('aide');
  if (/ (crous|bourse) /.test(n)) return bySource('bourse');
  if (/ (salaire|paie|paye|remuneration) /.test(n)) return bySource('job');
  return null;
}

// ---------- Doublons ----------

/**
 * Repère les lignes du relevé déjà présentes dans l'appli : même sens (dépense / revenu),
 * même montant, date à ± `toleranceDays` jours (une carte est souvent débitée 1 à 3 jours après l'achat).
 * Chaque opération existante ne peut correspondre qu'à une seule ligne.
 */
export function findDuplicates(rows: StatementRow[], existing: Transaction[], toleranceDays = 3): boolean[] {
  const pool = existing.filter((t) => t.type === 'expense' || t.type === 'income');
  const used = new Set<string>();
  return rows.map((row) => {
    const type = row.amount < 0 ? 'expense' : 'income';
    const amount = Math.abs(row.amount);
    let best: Transaction | null = null;
    let bestGap = Infinity;
    for (const t of pool) {
      if (used.has(t.id) || t.type !== type || t.amount !== amount) continue;
      const gap = Math.abs(diffDays(row.date, t.date));
      if (gap <= toleranceDays && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    if (best) used.add(best.id);
    return !!best;
  });
}

export interface ImportCandidate extends StatementRow {
  key: string;
  type: 'expense' | 'income';
  merchant: string;
  note: string;
  categoryId: ID | null;
  duplicate: boolean;
}

/** Prépare les lignes à importer : commerçant nettoyé, catégorie devinée, doublons repérés. */
export function buildCandidates(
  rows: StatementRow[],
  existing: Transaction[],
  categories: Category[],
  learned: Record<string, ID> = {},
): ImportCandidate[] {
  const dup = findDuplicates(rows, existing);
  const fallbackExpense = categories.find((c) => c.kind === 'expense' && !c.archived && c.name === 'Autre')?.id ?? null;
  const fallbackIncome = categories.find((c) => c.kind === 'income' && !c.archived && c.incomeSource === 'autre')?.id ?? null;
  return rows
    .map((r, i) => {
      const type: 'expense' | 'income' = r.amount < 0 ? 'expense' : 'income';
      const note = cleanBankLabel(r.label);
      const categoryId =
        type === 'expense'
          ? (guessCategory(note, categories, learned) ?? guessCategory(r.label, categories, learned) ?? fallbackExpense)
          : (guessIncomeCategory(r.label, categories) ?? fallbackIncome);
      return { ...r, key: `${r.date}|${r.amount}|${i}`, type, merchant: note, note, categoryId, duplicate: dup[i] };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

