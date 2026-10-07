import type { AppData } from '../../hooks/useData';
import { db } from '../../db/db';
import { addTransaction, updateSettings } from '../../db/actions';
import { guessCategory, merchantKey, parseIncomingPayment, prettyMerchant, type IncomingPayment } from '../../lib/merchant';
import { formatMoney } from '../../lib/money';
import { haptic } from '../../lib/haptics';
import { toast, useTxSheet } from '../../stores/ui';
import { checkBudgetAfterChange } from '../alerts';
import { isIOSSafariTab } from '../../lib/notifications';
import type { ID, ISODate, Transaction } from '../../types';

const DUPLICATE_WINDOW_MS = 3 * 60_000;

/** L'URL actuelle transmet-elle un paiement Apple Pay ? */
export function hasIncomingPayment(search = location.search): boolean {
  const p = new URLSearchParams(search);
  return p.has('applepay') || p.has('montant');
}

/**
 * Enregistre un paiement Apple Pay comme dépense : catégorie devinée d'après le commerçant,
 * compte par défaut. Ne notifie pas (l'appelant décide du message).
 */
export async function recordApplePayment(
  data: AppData,
  payment: IncomingPayment,
  opts: { date?: ISODate; createdAt?: number; id?: ID } = {},
): Promise<Transaction | null> {
  const expenseCats = data.categories.filter((c) => c.kind === 'expense' && !c.archived);
  const categoryId: ID | null =
    guessCategory(payment.merchant, data.categories, data.settings.merchantRules ?? {}) ??
    expenseCats.find((c) => c.name === 'Autre')?.id ??
    expenseCats[0]?.id ??
    null;
  const accountId = data.settings.defaultAccountId ?? data.accounts.find((a) => !a.archived)?.id;
  if (!accountId) return null;
  return addTransaction({
    id: opts.id,
    createdAt: opts.createdAt,
    type: 'expense',
    amount: payment.amount,
    date: opts.date ?? data.today,
    categoryId,
    accountId,
    toAccountId: null,
    note: prettyMerchant(payment.merchant),
    recurringId: null,
    occurrence: null,
    source: 'applepay',
    merchant: payment.merchant,
  });
}

/** Message de confirmation, avec « Modifier » pour corriger la catégorie (qui sera alors apprise). */
export function announcePayments(data: AppData, txs: Transaction[]) {
  if (!txs.length) return;
  haptic('success');
  if (txs.length === 1) {
    const tx = txs[0];
    const cat = tx.categoryId ? data.categoryById.get(tx.categoryId) : undefined;
    toast(`${tx.note} · ${formatMoney(tx.amount)} ajouté${cat ? ` dans ${cat.emoji} ${cat.name}` : ''}`, {
      tone: 'success',
      duration: 6000,
      action: { label: 'Modifier', onClick: () => useTxSheet.getState().openEdit(tx) },
    });
  } else {
    const total = txs.reduce((s, t) => s + t.amount, 0);
    toast(`${txs.length} paiements Apple Pay ajoutés (${formatMoney(total)})`, { tone: 'success', duration: 6000 });
  }
  for (const tx of txs) void checkBudgetAfterChange(data, tx);
}

/**
 * Paiement transmis directement par l'URL (`?applepay=montant|commerçant`).
 * Méthode d'origine, conservée pour les configurations où le lien s'ouvre dans l'appli.
 */
export async function receiveApplePay(data: AppData): Promise<Transaction | null> {
  const search = location.search;
  // Ouvert dans Safari sur iPhone : <ApplePayInSafari> s'en charge (données séparées de l'appli installée)
  if (!hasIncomingPayment(search) || isIOSSafariTab()) return null;
  history.replaceState(null, '', location.pathname);
  const payment = parseIncomingPayment(search);
  if (!payment) {
    toast('Paiement Apple Pay reçu mais illisible. Vérifie le raccourci (Réglages → Paiements Apple Pay).', { tone: 'error', duration: 6000 });
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

  const tx = await recordApplePayment(data, payment);
  if (!tx) return null;
  await updateSettings({ lastApplePayAt: Date.now(), applePayCount: (data.settings.applePayCount ?? 0) + 1 });
  announcePayments(data, [tx]);
  return tx;
}

/** Quand l'utilisateur corrige la catégorie d'un paiement Apple Pay, on retient le choix pour ce commerçant. */
export async function learnMerchantCategory(data: AppData, merchant: string, categoryId: ID | null) {
  if (!merchant || !categoryId) return;
  const key = merchantKey(merchant);
  if (!key || data.settings.merchantRules?.[key] === categoryId) return;
  await updateSettings({ merchantRules: { ...(data.settings.merchantRules ?? {}), [key]: categoryId } });
}
