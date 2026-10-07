import type { AppData } from '../../hooks/useData';
import { db } from '../../db/db';
import { updateSettings } from '../../db/actions';
import { parseIncomingPayment } from '../../lib/merchant';
import { todayISO } from '../../lib/dates';
import { announcePayments, recordApplePayment } from './receive';
import type { Transaction } from '../../types';

/**
 * Relais Apple Pay (Cloudflare Worker, dossier relay/).
 * Le raccourci iOS y envoie chaque paiement en arrière-plan ; l'appli les récupère ici,
 * les enregistre puis les fait effacer du relais.
 */
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? 'https://budget-relais.nathanguillerme1.workers.dev';

export interface RelayItem {
  id: string;
  amount: string;
  merchant: string;
  receivedAt: number;
}

/** Adresse à coller dans le raccourci iOS : action « Get Contents of URL », méthode POST, corps JSON {montant, marchand}. */
export function shortcutPostUrl(key: string): string {
  return `${RELAY_URL}/pay?key=${encodeURIComponent(key)}`;
}

/** Variante GET (texte « montant|commerçant » encodé à la suite), utilisée par le test intégré. */
export function shortcutUrlPrefix(key: string): string {
  return `${RELAY_URL}/pay?key=${encodeURIComponent(key)}&applepay=`;
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type ActivationResult = 'ok' | 'already-linked' | 'error';

/** Génère une clé secrète et la confie au relais (possible une seule fois). */
export async function activateRelay(): Promise<ActivationResult> {
  const key = randomKey();
  try {
    const res = await fetch(`${RELAY_URL}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (res.status === 409) return 'already-linked';
    if (!res.ok) return 'error';
    await updateSettings({ relayKey: key });
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Utilise une clé existante (ex. après réinstallation, si la sauvegarde n'est pas disponible). */
export async function useExistingKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${RELAY_URL}/pending`, { headers: { Authorization: `Bearer ${key.trim()}` } });
    if (!res.ok) return false;
    await updateSettings({ relayKey: key.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Envoie un faux paiement au relais, comme le ferait le raccourci (pour tester toute la chaîne). */
export async function sendTestPayment(key: string): Promise<boolean> {
  try {
    const res = await fetch(shortcutUrlPrefix(key) + encodeURIComponent('0,01 €|Test Apple Pay'));
    return res.ok;
  } catch {
    return false;
  }
}

let running: Promise<Transaction[]> | null = null;

/**
 * Récupère les paiements en attente sur le relais et les enregistre.
 * Idempotent : chaque paiement du relais devient une transaction d'identifiant `relay-<id>`,
 * donc un même paiement n'est jamais ajouté deux fois, même si l'effacement a échoué.
 */
export function syncRelay(data: AppData): Promise<Transaction[]> {
  if (running) return running;
  running = (async () => {
    const key = data.settings.relayKey;
    if (!key || !navigator.onLine) return [];
    const headers = { Authorization: `Bearer ${key}` };
    let items: RelayItem[];
    try {
      const res = await fetch(`${RELAY_URL}/pending`, { headers, cache: 'no-store' });
      if (!res.ok) return [];
      items = ((await res.json()) as { items: RelayItem[] }).items ?? [];
    } catch {
      return [];
    }
    if (!items.length) return [];

    const created: Transaction[] = [];
    const done: string[] = [];
    for (const item of items) {
      const txId = `relay-${item.id}`;
      if (await db.transactions.get(txId)) {
        done.push(item.id);
        continue;
      }
      const payment = parseIncomingPayment(`?applepay=${encodeURIComponent(`${item.amount}|${item.merchant}`)}`);
      if (!payment) {
        done.push(item.id); // illisible : on l'écarte pour ne pas bloquer la file
        continue;
      }
      // Date du paiement (et non du jour de l'import), à l'heure de Paris
      // Identifiant stable (relay-<id>) : jamais de doublon ; date du paiement à l'heure de Paris
      const tx = await recordApplePayment(data, payment, { id: txId, createdAt: item.receivedAt, date: todayISO(new Date(item.receivedAt)) });
      if (tx) created.push(tx);
      done.push(item.id);
    }

    try {
      await fetch(`${RELAY_URL}/ack`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: done }),
      });
    } catch {
      /* sera réessayé à la prochaine synchro ; les doublons sont évités par l'identifiant stable */
    }
    if (created.length) {
      await updateSettings({ lastApplePayAt: Date.now(), applePayCount: (data.settings.applePayCount ?? 0) + created.length });
      announcePayments(data, created);
    }
    return created;
  })().finally(() => {
    running = null;
  });
  return running;
}
