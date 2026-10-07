import type { Cents, ID, Member, SharedExpense } from '../types';
import { splitEqually } from './money';

/**
 * Solde net de chaque membre : positif = on lui doit de l'argent, négatif = il doit de l'argent.
 * Un remboursement (settlement) de A vers B se traite comme une dépense payée par A
 * et entièrement "consommée" par B.
 */
export function memberBalances(members: Member[], expenses: SharedExpense[]): Map<ID, Cents> {
  const map = new Map<ID, Cents>(members.map((m) => [m.id, 0]));
  for (const e of expenses) {
    map.set(e.paidBy, (map.get(e.paidBy) ?? 0) + e.amount);
    for (const s of e.splits) map.set(s.memberId, (map.get(s.memberId) ?? 0) - s.share);
  }
  return map;
}

export interface Settlement {
  from: ID;
  to: ID;
  amount: Cents;
}

/**
 * Remboursements pour solder le groupe avec le moins de virements possible
 * (algorithme glouton : le plus gros débiteur rembourse le plus gros créancier).
 * Produit au plus n − 1 virements.
 */
export function minimalSettlements(balances: Map<ID, Cents>): Settlement[] {
  const creditors: { id: ID; amount: Cents }[] = [];
  const debtors: { id: ID; amount: Cents }[] = [];
  for (const [id, bal] of balances) {
    if (bal > 0) creditors.push({ id, amount: bal });
    else if (bal < 0) debtors.push({ id, amount: -bal });
  }
  const out: Settlement[] = [];
  const byAmount = (a: { amount: number; id: string }, b: { amount: number; id: string }) =>
    b.amount - a.amount || a.id.localeCompare(b.id);
  creditors.sort(byAmount);
  debtors.sort(byAmount);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return out;
}

/** Parts égales entre les membres choisis (reste réparti au centime). */
export function equalSplits(amount: Cents, memberIds: ID[]) {
  const shares = splitEqually(amount, memberIds.length);
  return memberIds.map((memberId, i) => ({ memberId, share: shares[i] }));
}
