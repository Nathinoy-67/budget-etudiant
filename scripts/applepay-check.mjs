// Vérifie la réception des paiements Apple Pay (lien envoyé par le raccourci iOS).
// Usage : `npm run dev` puis `node scripts/applepay-check.mjs [url]`
import { webkit, devices } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:5173/budget-etudiant/';
const pay = (amount, merchant) => `${BASE}?applepay=${encodeURIComponent(`${amount}|${merchant}`)}`;
const ok = (m) => console.log(`✓ ${m}`);
const browser = await webkit.launch();
const errors = [];

// 1. Appli installée sur l'écran d'accueil (mode standalone simulé)
const app = await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await app.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
const page = await app.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);
await page.getByRole('button', { name: /données exemple/ }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });

await page.goto(pay('12,40 €', 'CARREFOUR CITY PARIS'));
await page.getByText(/Carrefour City Paris · 12,40.€ ajouté dans 🛒 Courses/).waitFor();
assert.ok(!page.url().includes('applepay'), "l'URL est nettoyée");
ok('paiement reçu, commerçant mis en forme, catégorie devinée (Courses)');

await page.goto(pay('12,40 €', 'CARREFOUR CITY PARIS'));
await page.getByText('Ce paiement est déjà enregistré').waitFor();
ok('doublon ignoré');

// Correction de la catégorie → apprise pour ce commerçant
await page.goto(pay('3,20 €', 'BOULANGERIE ANGE'));
await page.getByText(/Boulangerie Ange · 3,20.€ ajouté/).waitFor();
await page.getByRole('status').getByRole('button', { name: 'Modifier' }).click();
await page.getByRole('radio', { name: /Loisirs/ }).click();
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.getByText('Opération modifiée').waitFor();
await page.waitForTimeout(500);
await page.goto(pay('2,10 €', 'BOULANGERIE ANGE LYON'));
await page.getByText(/Boulangerie Ange Lyon · 2,10.€ ajouté dans 🎉 Loisirs/).waitFor();
ok('catégorie corrigée retenue pour le commerçant');

await page.goto(pay('7,00 €', 'SARL INCONNUE'));
await page.getByText(/Sarl Inconnue · 7,00.€ ajouté dans 📦 Autre/).waitFor();
ok('commerçant inconnu → Autre');

await page.goto(`${BASE}?applepay=${encodeURIComponent('abc|Test')}`);
await page.getByText(/reçu mais illisible/).waitFor();
ok('lien invalide signalé');

await page.getByRole('navigation').getByRole('button', { name: 'Plus' }).click();
await page.getByRole('button', { name: /Paiements Apple Pay/ }).click();
await page.getByText('Actif ✅').waitFor();
ok("écran de configuration : statut actif");

// 2. Lien ouvert dans Safari (pas l'appli installée)
const safari = await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const sp = await safari.newPage();
sp.on('pageerror', (e) => errors.push(e.message));
await sp.goto(pay('0,01 €', 'Test Apple Pay'));
await sp.getByRole('heading', { name: 'Ouvert dans Safari' }).waitFor();
await sp.getByText(/pas.*été enregistré/).waitFor();
ok('dans Safari : avertissement affiché, rien d’enregistré');

console.log(errors.length ? `ERREURS JS:\n${errors.join('\n')}` : 'Aucune erreur JS.');
await browser.close();
