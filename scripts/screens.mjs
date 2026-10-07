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
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${scheme}-${name}.png`) });
};
const scroll = (y) =>
  page.evaluate((y) => {
    const els = [...document.querySelectorAll('.scroll-area')].filter((e) => e.offsetParent && !e.closest('[inert]'));
    els[els.length - 1]?.scrollTo(0, y);
  }, y);
const tab = (label) => page.getByRole('navigation').getByRole('button', { name: label }).click();

await page.goto(BASE);
await page.getByRole('button', { name: /données exemple/ }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });
await page.waitForTimeout(3000); // laisse partir les toasts
await shot('accueil-1');
await scroll(700);
await shot('accueil-2');
await scroll(0);
await tab('Opérations');
await shot('operations');
await tab('Analyse');
await page.waitForTimeout(1200);
await shot('stats-1');
await scroll(800);
await shot('stats-2');
await tab('Plus');
await shot('plus');
await page.getByRole('button', { name: /^Budgets/ }).click();
await shot('budgets');
await page.getByRole('button', { name: 'Retour' }).last().click();
await page.getByRole('button', { name: /Objectifs/ }).click();
await shot('objectifs');
await page.getByRole('button', { name: 'Retour' }).last().click();
await page.getByRole('navigation').getByRole('button', { name: 'Ajouter une opération' }).click();
await shot('saisie');
console.log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'ok');
await browser.close();
