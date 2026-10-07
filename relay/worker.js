/**
 * Relais Budget Étudiant (Cloudflare Worker + KV).
 *
 * Le raccourci iOS (automatisation « Transaction » d'Apple Pay) envoie chaque paiement ici,
 * en arrière-plan. L'appli Budget récupère ensuite les paiements en attente puis les efface.
 *
 * Sécurité : une clé secrète générée par l'appli (« premier arrivé ») protège toutes les routes.
 * Seule son empreinte SHA-256 est stockée. Les paiements non récupérés expirent après 60 jours.
 *
 * Routes :
 *   GET  /                         état du relais (sans clé)
 *   POST /claim   {key}            enregistre la clé (une seule fois)
 *   GET  /pay?key=…&applepay=…     ajoute un paiement « montant|commerçant » (appelé par le raccourci)
 *   POST /pay?key=…  {montant, marchand}   variante JSON
 *   GET  /pending                  paiements en attente (en-tête Authorization: Bearer <clé>)
 *   POST /ack     {ids:[…]}        efface les paiements récupérés
 */

const TTL_SECONDS = 60 * 24 * 3600;
const MAX_FIELD = 200;
const MAX_PENDING = 500;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
  });
}

function readKey(request, url) {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return url.searchParams.get('key') ?? '';
}

async function isAuthorized(request, url, env) {
  const key = readKey(request, url);
  if (key.length < 20) return false;
  const stored = await env.PAYMENTS.get('config:keyhash');
  return !!stored && safeEqual(await sha256(key), stored);
}

async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // État (public, ne révèle rien)
    if (url.pathname === '/' && request.method === 'GET') {
      const claimed = !!(await env.PAYMENTS.get('config:keyhash'));
      return json({ service: 'budget-relais', claimed }, 200, cors);
    }

    // Enregistrement de la clé : seulement si aucune clé n'existe encore
    if (url.pathname === '/claim' && request.method === 'POST') {
      const { key } = await readBody(request);
      if (typeof key !== 'string' || key.length < 20 || key.length > 200) return json({ error: 'clé invalide' }, 400, cors);
      if (await env.PAYMENTS.get('config:keyhash')) return json({ error: 'relais déjà lié' }, 409, cors);
      await env.PAYMENTS.put('config:keyhash', await sha256(key));
      return json({ ok: true }, 200, cors);
    }

    if (!(await isAuthorized(request, url, env))) return json({ error: 'clé manquante ou incorrecte' }, 401, cors);

    // Nouveau paiement (raccourci iOS)
    if (url.pathname === '/pay' && (request.method === 'GET' || request.method === 'POST')) {
      let amount = '';
      let merchant = '';
      const combined = url.searchParams.get('applepay');
      if (combined) {
        const i = combined.indexOf('|');
        amount = i >= 0 ? combined.slice(0, i) : combined;
        merchant = i >= 0 ? combined.slice(i + 1) : '';
      } else if (request.method === 'POST') {
        const body = await readBody(request);
        amount = String(body.montant ?? body.amount ?? '');
        merchant = String(body.marchand ?? body.merchant ?? '');
      } else {
        amount = url.searchParams.get('montant') ?? '';
        merchant = url.searchParams.get('marchand') ?? '';
      }
      amount = amount.trim().slice(0, MAX_FIELD);
      merchant = merchant.trim().slice(0, MAX_FIELD);
      if (!amount) return json({ error: 'montant manquant' }, 400, cors);
      const receivedAt = Date.now();
      const id = `${receivedAt.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      await env.PAYMENTS.put(`p:${id}`, JSON.stringify({ id, amount, merchant, receivedAt }), { expirationTtl: TTL_SECONDS });
      return json({ ok: true, id }, 200, cors);
    }

    // Paiements en attente (appli)
    if (url.pathname === '/pending' && request.method === 'GET') {
      const list = await env.PAYMENTS.list({ prefix: 'p:', limit: MAX_PENDING });
      const items = (await Promise.all(list.keys.map((k) => env.PAYMENTS.get(k.name, 'json')))).filter(Boolean);
      items.sort((a, b) => a.receivedAt - b.receivedAt);
      return json({ items }, 200, cors);
    }

    // Accusé de réception : efface les paiements importés
    if (url.pathname === '/ack' && request.method === 'POST') {
      const { ids } = await readBody(request);
      if (!Array.isArray(ids)) return json({ error: 'ids manquants' }, 400, cors);
      await Promise.all(ids.slice(0, MAX_PENDING).map((id) => env.PAYMENTS.delete(`p:${String(id)}`)));
      return json({ ok: true }, 200, cors);
    }

    return json({ error: 'introuvable' }, 404, cors);
  },
};
