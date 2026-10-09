// Vérifie l'import d'un relevé bancaire (CSV façon Crédit Agricole) : aperçu, doublons, import.
// Usage : `npm run dev` puis `node scripts/import-check.mjs [url]`
import { webkit, devices } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const BASE = process.argv[2] ?? 'http://localhost:5173/budget-etudiant/';
const ok = (m) => console.log(`✓ ${m}`);
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const db = (fn) =>
  page.evaluate(
    (src) =>
      new Promise((res) => {
        const r = indexedDB.open('budget-etudiant');
        r.onsuccess = () => {
          const q = r.result.transaction('transactions').objectStore('transactions').getAll();
          q.onsuccess = () => res(new Function('rows', src)(q.result));
        };
      }),
    fn,
  );

await page.goto(BASE);
await page.getByRole('button', { name: /données exemple/ }).click();
await page.getByText('Données exemple chargées').waitFor({ timeout: 20000 });

// Relevé : une opération identique au loyer déjà généré (doublon), + 3 nouvelles
const loyer = await db("const t = rows.filter(r => r.note === 'Loyer').sort((a,b) => a.date < b.date ? 1 : -1)[0]; return t;");
const [y, m, d] = loyer.date.split('-');
const today = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
const csv = [
  'Compte courant n° 12345678901',
  `Solde au ${today} : 312,45 €`,
  '',
  'Date;Libellé;Débit euros;Crédit euros;',
  `${today};"PAIEMENT PAR CARTE X1234 CARREFOUR CITY PARIS";23,40;;`,
  `${today};"PAIEMENT PAR CARTE X1234 SNCF CONNECT";15,00;;`,
  `${d}/${m}/${y};"PRLV SEPA SCI LES LILAS LOYER";480,00;;`,
  `${today};"VIR SEPA RECU /DE MAMIE /MOTIF CADEAU";;50,00;`,
].join('\r\n');
const dir = mkdtempSync(join(tmpdir(), 'releve-'));
const file = join(dir, 'releve.csv');
writeFileSync(file, Buffer.from(csv, 'latin1')); // encodage Windows-1252 comme les exports bancaires

const before = await db('return rows.length;');
await page.getByRole('button', { name: 'Réglages' }).click();
await page.getByRole('button', { name: /Importer un relevé bancaire/ }).click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choisir le fichier' }).click()]);
await chooser.setFiles(file);
await page.getByText('3 à importer').waitFor();
await page.getByText(/1 opération déjà dans l'appli/).waitFor();
assert.ok(await page.getByText('Carrefour City Paris').isVisible(), 'libellé nettoyé');
ok('aperçu : 3 nouvelles, le loyer reconnu comme doublon');

await page.getByRole('button', { name: 'Importer 3 opérations' }).click();
await page.getByText('3 opérations importées').waitFor();
const after = await db('return rows.length;');
assert.equal(after, before + 3);
const imported = await db("return rows.filter(r => r.source === 'import').map(r => r.note + ':' + r.type + ':' + r.amount).sort();");
assert.deepEqual(imported, ['Carrefour City Paris:expense:2340', 'Mamie:income:5000', 'Sncf Connect:expense:1500'].sort());
ok('import : 3 opérations ajoutées, montants et sens corrects');

// Réimporter le même fichier : tout est reconnu comme doublon (on est revenu sur les Réglages)
await page.getByRole('button', { name: /Importer un relevé bancaire/ }).click();
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choisir le fichier' }).click()]);
await chooser2.setFiles(file);
await page.getByText('0 à importer').waitFor();
ok('réimport du même fichier : aucun doublon possible');

console.log(errors.length ? `ERREURS JS:\n${errors.join('\n')}` : 'Aucune erreur JS.');
await browser.close();
