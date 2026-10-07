import type { AppData } from '../../hooks/useData';
import { db } from '../../db/db';
import { addTransaction, updateSettings } from '../../db/actions';
import { guessCategory, merchantKey, parseIncomingPayment, prettyMerchant } from '../../lib/merchant';
import { formatMoney } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { toast, useTxSheet } from '../../stores/ui';
import { checkBudgetAfterChange } from '../alerts';
import { isIOSSafariTab } from '../../lib/notifications';
import type { ID, Transaction } from '../../types';

const DUPLICATE_WINDOW_MS = 3 * 60_000;

/** L'URL actuelle transmet-elle un paiement Apple Pay ? */
export function hasIncomingPayment(search = location.search): boolean {
  const p = new URLSearchParams(search);
  return p.has('applepay') || p.has('montant');
}

/** Retire les paramètres du paiement de l'URL (un rechargement ne doit pas l'ajouter deux fois). */
function cleanUrl() {
  history.replaceState(null, '', location.pathname);
}

/**
 * Enregistre le paiement Apple Pay transmis par le raccourci iOS (Raccourcis → Automatisation → Transaction).
 * Retourne la transaction créée, ou null s'il n'y a rien à faire.
 */
export async function receiveApplePay(data: AppData): Promise<Transaction | null> {
  const search = location.search;
  // Ouvert dans Safari sur iPhone : <ApplePayInSafari> s'en charge (données séparées de l'appli installée)
  if (!hasIncomingPayment(search) || isIOSSafariTab()) return null;
  cleanUrl();
  const payment = parseIncomingPayment(search);
  if (!payment) {
    toast('Paiement Apple Pay reçu mais illisible. Vérifie le raccourci (Plus → Paiements Apple Pay).', { tone: 'error', duration: 6000 });
    return null;
  }

  // Anti-doublon : même montant et même commerçant il y a moins de 3 minutes
  const since = Date.now() - DUPLICATE_WINDOW_MS;
  const duplicate = await db.transactions
    .where('date')
    .equals(data.today)
    .filter((t) => t.source === 'applepay' && t.amount === payment.amount && t.merchant === payment.merchant && t.createdAt > since)
    .first();
  if (duplicate) {
    toast('Ce paiement est déjà enregistré');
    return null;
  }

  const expenseCats = data.categories.filter((c) => c.kind === 'expense' && !c.archived);
  const categoryId: ID | null =
    guessCategory(payment.merchant, data.categories, data.settings.merchantRules ?? {}) ??
    expenseCats.find((c) => c.name === 'Autre')?.id ??
    expenseCats[0]?.id ??
    null;
  const accountId = data.settings.defaultAccountId ?? data.accounts.find((a) => !a.archived)?.id;
  if (!accountId) return null;

  const tx = await addTransaction({
    type: 'expense',
    amount: payment.amount,
    date: data.today,
    categoryId,
    accountId,
    toAccountId: null,
    note: prettyMerchant(payment.merchant),
    recurringId: null,
    occurrence: null,
    source: 'applepay',
    merchant: payment.merchant,
  });
  await updateSettings({ lastApplePayAt: Date.now(), applePayCount: (data.settings.applePayCount ?? 0) + 1 });

  const cat = categoryId ? data.categoryById.get(categoryId) : undefined;
  haptic('success');
  toast(`${tx.note} · ${formatMoney(tx.amount)} ajouté${cat ? ` dans ${cat.emoji} ${cat.name}` : ''}`, {
    tone: 'success',
    duration: 6000,
    action: { label: 'Modifier', onClick: () => useTxSheet.getState().openEdit(tx) },
  });
  void checkBudgetAfterChange(data, tx);
  return tx;
}

/** Quand l'utilisateur corrige la catégorie d'un paiement Apple Pay, on retient le choix pour ce commerçant. */
export async function learnMerchantCategory(data: AppData, merchant: string, categoryId: ID | null) {
  if (!merchant || !categoryId) return;
  const key = merchantKey(merchant);
  if (!key || data.settings.merchantRules?.[key] === categoryId) return;
  await updateSettings({ merchantRules: { ...(data.settings.merchantRules ?? {}), [key]: categoryId } });
}
