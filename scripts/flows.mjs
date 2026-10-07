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

const nav = (label) => page.getByRole('navigation').getByRole('button', { name: label }).click();
const openMore = async (title) => {
  await nav('Plus');
  await nav('Plus'); // re-taper l'onglet revient à la racine
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
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

// --- Recherche + édition ---
await nav('Opérations');
await page.getByRole('button', { name: 'Tout', exact: true }).click();
await page.getByLabel('Rechercher une opération').fill('kebab');
const rows = page.getByRole('button', { name: /Kebab, dépense/ });
assert.ok((await rows.count()) > 0, 'recherche insensible à la casse');
await rows.first().click();
await page.getByRole('button', { name: 'Effacer' }).click();
await page.getByRole('button', { name: 'Effacer' }).click();
await page.getByRole('button', { name: 'Effacer' }).click();
await page.getByRole('button', { name: 'Effacer' }).click();
await page.getByRole('button', { name: 'Effacer' }).click();
await keypad(['9', 'Virgule', '9']);
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.getByText('Opération modifiée').waitFor();
assert.ok(await page.getByText('−9,90 €').locator('visible=true').first().isVisible(), 'montant modifié');
step('recherche et modification');

// --- Suppression par glissement + annulation ---
await page.getByLabel('Rechercher une opération').fill('');
const before = await countTx();
const target = page.getByRole('button', { name: /dépense\. Toucher pour modifier/ }).first();
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

// --- Glisser depuis le bord gauche pour revenir ---
await openMore('Comptes');
await page.getByText('Patrimoine total').waitFor();
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
await page.getByText('Patrimoine total').waitFor({ state: 'detached' });
step('glisser depuis le bord pour revenir');
await nav('Opérations');

// --- Filtres ---
await page.getByRole('button', { name: 'Filtres' }).click();
await page.getByRole('radio', { name: 'Revenus' }).click();
await page.getByRole('button', { name: 'OK' }).click();
assert.equal(await page.getByRole('button', { name: /dépense\. Toucher/ }).count(), 0, 'filtre revenus');
step('filtre par type');

// --- Sauter une échéance ---
await openMore('Opérations récurrentes');
await page.getByRole('button', { name: /Loyer/ }).first().click();
const skipBtn = page.getByRole('button', { name: 'Sauter' }).first();
await skipBtn.click();
await page.getByRole('button', { name: 'Rétablir' }).first().waitFor();
step('sauter une échéance');
await page.getByRole('button', { name: 'Rétablir' }).first().click();
await page.getByText('Échéance rétablie').waitFor();
await page.keyboard.press('Escape');
step('rétablir une échéance');
await back();

// --- Objectif : versement ---
await openMore("Objectifs d'épargne");
await page.getByRole('button', { name: /Permis de conduire/ }).click();
await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Effacer' }).click();
await keypad(['5', '0']);
await page.getByRole('button', { name: 'Ajouter', exact: true }).last().click();
await page.getByText('Versement enregistré').waitFor();
assert.ok(await page.getByText('450,00 €').first().isVisible(), 'objectif crédité (400 + 50)');
step('versement sur un objectif');
await back();
await back();

// --- Colocation : remboursement ---
await openMore('Dépenses partagées');
await page.getByRole('button', { name: /Coloc/ }).click();
const nBefore = await page.getByRole('button', { name: 'Remboursé' }).count();
await page.getByRole('button', { name: 'Remboursé' }).first().click();
await confirm('Marquer comme remboursé');
await page.getByText('Remboursement enregistré').waitFor();
await page.waitForFunction((n) => document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Remboursé' && b.offsetParent).length === n, nBefore - 1, { timeout: 5000 });
step('remboursement minimal en colocation');
await back();
await back();

// --- Export CSV + JSON, réinitialisation, import ---
await openMore('Réglages');
const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter les opérations/ }).click()]);
const csvText = readFileSync(await csv.path(), 'utf8');
assert.ok(csvText.startsWith('﻿Date;Type;Montant'), 'CSV avec en-tête');
step(`export CSV (${csvText.trim().split('\n').length - 1} lignes)`);

const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter une sauvegarde/ }).click()]);
const jsonPath = await json.path();
const backup = JSON.parse(readFileSync(jsonPath, 'utf8'));
assert.equal(backup.app, 'budget-etudiant');
const exported = backup.data.transactions.length;
step(`export JSON (${exported} opérations)`);

await page.getByRole('button', { name: /Tout réinitialiser/ }).click();
await confirm('Tout effacer');
await confirm('Oui, tout effacer');
await page.getByText('Bienvenue').waitFor();
assert.equal(await countTx(), 0, 'réinitialisé');
step('réinitialisation');

// import depuis l'onboarding : terminer puis restaurer
await page.getByRole('button', { name: 'Passer' }).click();
await page.getByRole('button', { name: 'Passer' }).click();
await page.getByRole('button', { name: 'Terminer' }).click();
await openMore('Réglages');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Restaurer une sauvegarde/ }).click()]);
await chooser.setFiles(jsonPath);
await confirm('Remplacer mes données');
await page.getByText('Sauvegarde restaurée').waitFor();
assert.equal(await countTx(), exported, 'import restaure toutes les opérations');
step('import JSON');

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
