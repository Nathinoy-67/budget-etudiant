// Vérifie la PWA déployée : manifest, icônes, meta iOS, service worker et fonctionnement hors ligne.
// Usage : node scripts/pwa-check.mjs <url>   (ex. http://localhost:4173/budget-etudiant/ après `npm run build && npm run preview`)
import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';

const URL_ = process.argv[2] ?? 'http://localhost:4173/budget-etudiant/';
const engine = process.argv[3] === 'chromium' ? chromium : webkit;
const ok = (m) => console.log(`✓ ${m}`);

// 1. Manifest et icônes
const html = await (await fetch(URL_)).text();
for (const tag of ['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'viewport-fit=cover', 'apple-touch-icon', 'rel="manifest"'])
  assert.ok(html.includes(tag), `index.html contient ${tag}`);
ok('meta iOS, apple-touch-icon et lien manifest présents');
const manifestHref = html.match(/rel="manifest" href="([^"]+)"/)[1];
const manifestUrl = new URL(manifestHref, URL_);
const manifest = await (await fetch(manifestUrl)).json();
assert.equal(manifest.display, 'standalone');
assert.ok(URL_.endsWith(manifest.start_url) || new URL(manifest.start_url, manifestUrl).href === URL_, 'start_url cohérent');
for (const icon of manifest.icons) {
  const res = await fetch(new URL(icon.src, manifestUrl));
  assert.equal(res.status, 200, `icône ${icon.src}`);
  assert.equal(res.headers.get('content-type'), 'image/png');
}
assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'icône maskable');
ok(`manifest valide (${manifest.icons.length} icônes accessibles, dont maskable)`);
const touch = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/)[1];
assert.equal((await fetch(new URL(touch, URL_))).status, 200);
ok('apple-touch-icon accessible');

// 2. Service worker + hors ligne
const browser = await engine.launch(engine === chromium ? { channel: 'chromium' } : {});
const ctx = await browser.newContext(engine === webkit ? { ...devices['iPhone 14'] } : {});
const page = await ctx.newPage();
await page.goto(URL_);
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15000 });
await page.evaluate(() => navigator.serviceWorker.ready);
const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
assert.ok(scope?.endsWith('/budget-etudiant/') || scope?.endsWith('/'), `scope ${scope}`);
ok(`service worker actif (scope ${scope})`);
await page.reload();
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.getByText(/Bienvenue|Reste à vivre/).first().waitFor({ timeout: 10000 });
ok("l'appli se recharge hors ligne");
await browser.close();
