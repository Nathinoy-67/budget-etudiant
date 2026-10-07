// Test de fumée bout-en-bout sur WebKit (moteur de Safari iOS) en émulation iPhone.
// Usage : lancer `npm run dev` puis `node scripts/smoke.mjs [url] [dossier-captures]`
import { webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173/budget-etudiant/';
const OUT = process.argv[3] ?? 'smoke-screens';
mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: 'light' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) });
};
const tab = (label) => page.getByRole('navigation').getByRole('button', { name: label }).click();
const more = async (title) => {
  await tab('Plus');
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
};
const scroll = (px) =>
  page.evaluate((y) => {
    const els = [...document.querySelectorAll('.scroll-area')].filter((e) => e.offsetParent && !e.closest('[inert]'));
    els[els.length - 1]?.scrollBy(0, y);
  }, px);
const back = () => page.getByRole('button', { name: 'Retour' }).last().click();

await page.goto(BASE);

// --- Onboarding ---
await page.getByLabel('Montant Job étudiant / salaire').fill('620');
await page.getByLabel('Montant APL / CAF').fill('195,50');
await page.getByLabel('Montant Virement des parents').fill('150');
await shot('onboarding-1');
await page.getByRole('button', { name: 'Continuer' }).click();
await page.getByLabel('Montant du loyer').fill('480');
await page.getByLabel('Solde actuel du compte courant').fill('350');
await shot('onboarding-2');
await page.getByRole('button', { name: 'Continuer' }).click();
await shot('onboarding-3');
await page.getByRole('button', { name: 'Terminer' }).click();
await shot('dashboard-initial');

// --- Ajout rapide d'une dépense au pavé numérique ---
await page.getByRole('button', { name: 'Ajouter une opération' }).click();
for (const k of ['1', '2', 'Virgule', '5']) await page.getByRole('group', { name: 'Pavé numérique' }).getByRole('button', { name: k, exact: true }).click();
await page.getByRole('radio', { name: /Courses/ }).click();
await shot('sheet-depense');
await page.getByRole('button', { name: /^Ajouter 12,50/ }).click();
await shot('dashboard-apres-ajout');

// Raccourci en un tap
await page.getByRole('button', { name: /^Ajouter Café/ }).click();
await shot('dashboard-raccourci');

// --- Opérations ---
await tab('Opérations');
await shot('transactions');

// --- Plus et sous-écrans ---
await tab('Plus');
await shot('plus');
for (const [title, name] of [
  ['Comptes', 'comptes'],
  ['Budgets', 'budgets'],
  ['Opérations récurrentes', 'recurrentes'],
  ['Abonnements', 'abonnements'],
  ["Objectifs d'épargne", 'objectifs'],
  ['Dépenses partagées', 'partage'],
  ['Simulateur', 'simulateur'],
  ['Catégories', 'categories'],
  ['Raccourcis', 'raccourcis'],
  ['Réglages', 'reglages'],
]) {
  await more(title);
  await shot(name);
  await back();
}

// --- Données de démo ---
await more('Réglages');
await page.getByRole('button', { name: /Charger des données exemple/ }).click();
await page.getByRole('alertdialog').getByRole('button', { name: 'Charger' }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });
await back();
await tab('Accueil');
await shot('demo-dashboard');
await scroll(900);
await shot('demo-dashboard-bas');
await tab('Analyse');
await page.waitForTimeout(1500);
await shot('demo-stats');
await scroll(900);
await shot('demo-stats-2');
await scroll(1200);
await shot('demo-stats-3');
await more('Budgets');
await shot('demo-budgets');
await back();
await more('Dépenses partagées');
await page.getByRole('button', { name: /Coloc/ }).click();
await shot('demo-coloc');
await back();
await back();
await more("Objectifs d'épargne");
await shot('demo-objectifs');
await back();
await more('Simulateur');
await shot('demo-simulateur');
await back();

// --- Mode sombre ---
await page.emulateMedia({ colorScheme: 'dark' });
await tab('Accueil');
await page.getByRole('navigation').getByRole('button', { name: 'Accueil' }).click();
await shot('dark-dashboard');
await page.getByRole('button', { name: 'Ajouter une opération' }).click();
await shot('dark-sheet');

console.log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'Aucune erreur JS.');
console.log(`${n} captures dans ${OUT}`);
await browser.close();
