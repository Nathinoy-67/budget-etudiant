// Scénarios fonctionnels avec vérifications (WebKit, émulation iPhone).
// Usage : `npm run dev` puis `node scripts/flows.mjs [url]`
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:5173/budget-etudiant/';
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const tab = async (label) => {
  await page.getByRole('navigation').getByRole('button', { name: label }).click();
  await page.getByRole('navigation').getByRole('button', { name: label }).click(); // re-taper = retour à la racine
};
const settings = async (row) => {
  await tab('Accueil');
  await page.getByRole('button', { name: 'Réglages' }).click();
  if (row) await page.getByRole('button', { name: new RegExp(row) }).first().click();
};
const back = () => page.getByRole('button', { name: 'Retour' }).last().click();
const confirm = (label) => page.getByRole('alertdialog').getByRole('button', { name: label }).click();
const keypad = async (keys) => {
  for (const k of keys) await page.getByRole('group', { name: 'Pavé numérique' }).last().getByRole('button', { name: k, exact: true }).click();
};
const countTx = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('budget-etudiant');
        r.onsuccess = () => {
          const q = r.result.transaction('transactions').objectStore('transactions').count();
          q.onsuccess = () => res(q.result);
        };
      }),
  );
const step = (name) => console.log(`✓ ${name}`);

await page.goto(BASE);
await page.getByRole('button', { name: /données exemple/ }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });
const initial = await countTx();
assert.ok(initial > 100, 'données démo chargées');
step(`démo chargée (${initial} opérations)`);

// --- Accueil : pas d'ajout rapide, opérations du mois présentes ---
assert.equal(await page.getByText('Ajout rapide').count(), 0, "plus d'ajout rapide");
assert.equal(await page.getByRole('navigation').getByRole('button').count(), 3, '2 onglets + bouton +');
assert.ok((await page.getByRole('button', { name: /dépense\. Toucher pour modifier/ }).count()) > 0, "opérations sur l'accueil");
step('accueil simplifié (2 onglets, opérations du mois)');

// --- Ajout d'une dépense (sans choix de compte ni virement) ---
await page.getByRole('button', { name: 'Ajouter une opération' }).click();
assert.equal(await page.getByRole('radio', { name: 'Virement' }).count(), 0, 'plus de virement');
await keypad(['4', 'Virgule', '5']);
await page.getByRole('radio', { name: /Courses/ }).click();
await page.getByRole('button', { name: /^Ajouter 4,50/ }).click();
await page.getByText(/Dépense ajoutée · 4,50/).waitFor();
assert.equal(await countTx(), initial + 1);
step('dépense ajoutée en 3 gestes');

// --- Recherche + édition ---
await page.getByRole('button', { name: 'Rechercher' }).click();
await page.getByRole('radio', { name: 'Tout', exact: true }).click();
await page.getByLabel('Rechercher une opération').fill('kebab');
const rows = page.getByRole('button', { name: /Kebab, dépense/ });
assert.ok((await rows.count()) > 0, 'recherche insensible à la casse');
await rows.first().click();
for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Effacer' }).click();
await keypad(['9', 'Virgule', '9']);
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.getByText('Opération modifiée').waitFor();
assert.ok(await page.getByText('−9,90 €').locator('visible=true').first().isVisible(), 'montant modifié');
step('recherche et modification');

// --- Suppression par glissement + annulation ---
await page.getByLabel('Rechercher une opération').fill('');
const before = await countTx();
const target = page.getByRole('button', { name: /dépense\. Toucher pour modifier/ }).locator('visible=true').first();
const box = await target.boundingBox();
await target.evaluate(async (el, b) => {
  const y = b.y + b.height / 2;
  const opts = (x) => ({ bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
  el.dispatchEvent(new PointerEvent('pointerdown', opts(b.x + b.width - 20)));
  for (let i = 1; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 16));
    window.dispatchEvent(new PointerEvent('pointermove', opts(b.x + b.width - 20 - i * 25)));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { ...opts(b.x + b.width - 320), buttons: 0 }));
}, box);
await page.getByText('Opération supprimée').waitFor();
assert.equal(await countTx(), before - 1, 'glisser supprime');
await page.getByRole('status').getByRole('button', { name: 'Annuler' }).last().click();
await page.waitForTimeout(400);
assert.equal(await countTx(), before, 'annuler restaure');
step('glisser pour supprimer + annuler');

// --- Filtre revenus ---
await page.getByRole('button', { name: 'Filtres' }).click();
await page.getByRole('radio', { name: 'Revenus' }).click();
await page.getByRole('button', { name: 'OK' }).click();
assert.equal(await page.getByRole('button', { name: /dépense\. Toucher/ }).locator('visible=true').count(), 0, 'filtre revenus');
step('filtre par type');

// --- Glisser depuis le bord pour revenir ---
await page.locator('div.touch-none.w-4').last().evaluate(async (el) => {
  const r = el.getBoundingClientRect();
  const o = (x) => ({ bubbles: true, cancelable: true, pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: x, clientY: r.y + 200, button: 0, buttons: 1 });
  el.dispatchEvent(new PointerEvent('pointerdown', o(5)));
  for (let i = 1; i <= 12; i++) {
    await new Promise((res) => setTimeout(res, 16));
    window.dispatchEvent(new PointerEvent('pointermove', o(5 + i * 20)));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { ...o(245), buttons: 0 }));
});
await page.getByLabel('Rechercher une opération').waitFor({ state: 'detached' });
step('glisser depuis le bord pour revenir');

// --- Budget depuis l'Analyse ---
await tab('Analyse');
await page.getByRole('button', { name: /Sport\/Santé/ }).first().click();
for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Effacer' }).click();
await keypad(['7', '5']);
await page.getByRole('button', { name: 'Définir le budget' }).click();
await page.getByText(/Budget Sport\/Santé : 75,00/).waitFor();
step("budget fixé depuis l'Analyse");
assert.equal(await page.getByText('Épargné', { exact: true }).count(), 0, 'plus de libellé « Épargné »');
await page.getByRole('button', { name: /Simulateur d'économies/ }).click();
await page.getByText('Tu économiserais').waitFor();
step("simulateur accessible depuis l'Analyse");
await back();

// --- Sauter une échéance ---
await settings('Revenus et charges fixes');
await page.getByRole('button', { name: /Loyer/ }).first().click();
await page.getByRole('button', { name: 'Sauter' }).first().click();
await page.getByRole('button', { name: 'Rétablir' }).first().waitFor();
await page.getByRole('button', { name: 'Rétablir' }).first().click();
await page.getByText('Échéance rétablie').waitFor();
await page.keyboard.press('Escape');
step('sauter puis rétablir une échéance');
await back();

// --- Export CSV + JSON, réinitialisation, import ---
const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter les opérations/ }).click()]);
assert.ok(readFileSync(await csv.path(), 'utf8').startsWith('﻿Date;Type;Montant'), 'CSV avec en-tête');
step('export CSV');
const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter une sauvegarde/ }).click()]);
const jsonPath = await json.path();
const exported = JSON.parse(readFileSync(jsonPath, 'utf8')).data.transactions.length;
step(`export JSON (${exported} opérations)`);

await page.getByRole('button', { name: /Tout réinitialiser/ }).click();
await confirm('Tout effacer');
await confirm('Oui, tout effacer');
await page.getByText('Bienvenue').waitFor();
assert.equal(await countTx(), 0, 'réinitialisé');
await page.getByRole('button', { name: 'Passer' }).click();
await page.getByRole('button', { name: 'Passer' }).click();
await page.getByRole('button', { name: 'Terminer' }).click();
await settings();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Restaurer une sauvegarde/ }).click()]);
await chooser.setFiles(jsonPath);
await confirm('Remplacer mes données');
await page.getByText('Sauvegarde restaurée').waitFor();
assert.equal(await countTx(), exported, 'import restaure toutes les opérations');
step('réinitialisation puis import JSON');

// --- Code PIN ---
await page.getByRole('switch', { name: 'Activer le code PIN' }).click();
const pin = async (code) => {
  for (const d of code) await page.getByRole('dialog').last().getByRole('button', { name: d, exact: true }).click();
  await page.waitForTimeout(250);
};
await pin('1357');
await pin('1357');
await page.getByText('Code PIN enregistré').waitFor();
await page.getByRole('button', { name: 'Verrouiller maintenant' }).click();
await page.getByText('Entre ton code').waitFor();
await pin('0000');
await page.getByText(/Code incorrect/).waitFor();
await pin('1357');
await page.getByText('Entre ton code').waitFor({ state: 'detached' });
step('code PIN : création, verrouillage, erreur, déverrouillage');

console.log(errors.length ? `ERREURS JS:\n${errors.join('\n')}` : 'Aucune erreur JS.');
await browser.close();
