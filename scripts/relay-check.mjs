// Vérifie la chaîne relais Apple Pay : activation, test intégré, paiement envoyé « comme le raccourci », pas de doublon.
// ⚠️ À lancer contre un relais LOCAL (`cd relay && npx wrangler dev`) : la liaison du vrai relais ne se fait qu'une fois.
// Usage : VITE_RELAY_URL=http://localhost:8787 npm run dev   puis   node scripts/relay-check.mjs
import { webkit, devices } from 'playwright';
import assert from 'node:assert/strict';

const APP = process.argv[2] ?? 'http://localhost:5173/budget-etudiant/';
const RELAY = process.argv[3] ?? 'http://localhost:8787';
assert.ok(!RELAY.includes('workers.dev'), 'refus de tester contre le relais de production');
const ok = (m) => console.log(`✓ ${m}`);
const errors = [];

const status = await (await fetch(`${RELAY}/`)).json();
assert.equal(status.claimed, false, 'le relais local doit être vierge (supprime son dossier de stockage)');

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const settingsKey = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('budget-etudiant');
        r.onsuccess = () => {
          const q = r.result.transaction('settings').objectStore('settings').get('main');
          q.onsuccess = () => res(q.result?.relayKey ?? null);
        };
      }),
  );
const countApplePay = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('budget-etudiant');
        r.onsuccess = () => {
          const q = r.result.transaction('transactions').objectStore('transactions').getAll();
          q.onsuccess = () => res(q.result.filter((t) => t.source === 'applepay').map((t) => ({ id: t.id, date: t.date, note: t.note })));
        };
      }),
  );

await page.goto(APP);
await page.getByRole('button', { name: /données exemple/ }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });
await page.getByRole('navigation').getByRole('button', { name: 'Plus' }).click();
await page.getByRole('button', { name: /Paiements Apple Pay/ }).click();

await page.getByRole('button', { name: 'Activer le relais' }).click();
await page.getByText('Relais activé ✅').waitFor();
const key = await settingsKey();
assert.ok(key && key.length >= 30, 'clé enregistrée');
assert.equal((await (await fetch(`${RELAY}/`)).json()).claimed, true);
ok('relais activé, clé secrète enregistrée');

await page.getByRole('button', { name: 'Tester le relais' }).click();
await page.getByText(/Test Apple Pay · 0,01.€ ajouté/).waitFor({ timeout: 40000 });
ok('test intégré : envoi puis récupération');

// Un autre appareil ne peut pas relier le relais
const claim2 = await fetch(`${RELAY}/claim`, { method: 'POST', body: JSON.stringify({ key: 'x'.repeat(40) }) });
assert.equal(claim2.status, 409);
assert.equal((await fetch(`${RELAY}/pending`, { headers: { Authorization: 'Bearer ' + 'x'.repeat(40) } })).status, 401);
ok('relais protégé (nouvelle liaison et mauvaise clé refusées)');

// Paiement envoyé exactement comme le raccourci iOS (GET + texte encodé)
const res = await fetch(`${RELAY}/pay?key=${encodeURIComponent(key)}&applepay=${encodeURIComponent('12,40 €|CARREFOUR CITY PARIS')}`);
assert.equal(res.status, 200);
await page.getByText(/Carrefour City Paris · 12,40.€ ajouté dans 🛒 Courses/).waitFor({ timeout: 40000 });
ok("paiement du raccourci reçu automatiquement (appli ouverte, sans action)");

await page.waitForTimeout(16000); // une synchro de plus : pas de doublon
const list = await countApplePay();
assert.equal(list.filter((t) => t.note === 'Carrefour City Paris').length, 1, 'pas de doublon');
assert.equal((await (await fetch(`${RELAY}/pending`, { headers: { Authorization: `Bearer ${key}` } })).json()).items.length, 0, 'relais vidé');
ok('aucun doublon, relais vidé après récupération');

// Paiement fait appli fermée : récupéré à la prochaine ouverture
await page.close();
await fetch(`${RELAY}/pay?key=${encodeURIComponent(key)}&applepay=${encodeURIComponent('8,90 €|MCDONALDS')}`);
await fetch(`${RELAY}/pay?key=${encodeURIComponent(key)}&applepay=${encodeURIComponent('2,00 €|RATP')}`);
const page2 = await ctx.newPage();
page2.on('pageerror', (e) => errors.push(e.message));
await page2.goto(APP);
await page2.getByText(/2 paiements Apple Pay ajoutés/).waitFor({ timeout: 40000 });
ok("paiements faits appli fermée : ajoutés à l'ouverture");

console.log(errors.length ? `ERREURS JS:\n${errors.join('\n')}` : 'Aucune erreur JS.');
await browser.close();
