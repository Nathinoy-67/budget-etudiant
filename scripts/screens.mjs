// Captures des écrans principaux (données exemple) pour revue visuelle.
// Usage : `npm run dev` puis `node scripts/screens.mjs <dossier> [light|dark]`
import { webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'screens';
const scheme = process.argv[3] ?? 'light';
const BASE = 'http://localhost:5173/budget-etudiant/?noanim';
mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: scheme });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${scheme}-${String(++n).padStart(2, '0')}-${name}.png`) });
};
const scroll = (y) =>
  page.evaluate((y) => {
    const els = [...document.querySelectorAll('.scroll-area')].filter((e) => e.offsetParent && !e.closest('[inert]'));
    els[els.length - 1]?.scrollTo(0, y);
  }, y);
const tab = (label) => page.getByRole('navigation').getByRole('button', { name: label }).click();
const back = () => page.getByRole('button', { name: 'Retour' }).last().click();

await page.goto(BASE);
await page.getByRole('button', { name: /données exemple/ }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });
await page.waitForTimeout(3000); // laisse partir les toasts
await shot('accueil');
await scroll(700);
await shot('accueil-operations');
await scroll(0);
await tab('Analyse');
await page.waitForTimeout(1200);
await shot('analyse');
await scroll(650);
await shot('analyse-categories');
await scroll(2400);
await shot('analyse-bas');
await page.getByRole('button', { name: /Simulateur d'économies/ }).click();
await shot('simulateur');
await back();
await tab('Accueil');
await page.getByRole('button', { name: 'Réglages' }).click();
await shot('reglages');
await page.getByRole('button', { name: /Revenus et charges fixes/ }).click();
await shot('revenus-charges');
await back();
await back();
await page.getByRole('button', { name: 'Rechercher' }).click();
await shot('recherche');
await back();
await page.getByRole('navigation').getByRole('button', { name: 'Ajouter une opération' }).click();
await shot('saisie');
console.log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'ok');
await browser.close();
