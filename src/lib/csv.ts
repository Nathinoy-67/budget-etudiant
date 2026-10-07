import type { Account, Category, Transaction } from '../types';

const TYPE_LABEL = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' } as const;

function cell(v: string): string {
  // Protection contre l'injection de formules dans Excel / Numbers
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Montant signé au format français : "-12,50". */
function frAmount(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Export CSV compatible Excel FR / Numbers : séparateur ";", décimale ",", BOM UTF-8.
 */
export function transactionsToCSV(transactions: Transaction[], categories: Category[], accounts: Account[]): string {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const header = ['Date', 'Type', 'Montant', 'Catégorie', 'Compte', 'Vers compte', 'Note', 'Récurrente'];
  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((t) => {
      const signed = t.type === 'expense' ? -t.amount : t.amount;
      // le montant reste numérique (pas de protection anti-formule sur le "-")
      return [
        cell(t.date),
        cell(TYPE_LABEL[t.type]),
        frAmount(signed),
        cell(t.categoryId ? (cat.get(t.categoryId) ?? '') : ''),
        cell(acc.get(t.accountId) ?? ''),
        cell(t.toAccountId ? (acc.get(t.toAccountId) ?? '') : ''),
        cell(t.note ?? ''),
        t.recurringId ? 'oui' : 'non',
      ].join(';');
    });
  return '﻿' + [header.join(';'), ...rows].join('\r\n') + '\r\n';
}
