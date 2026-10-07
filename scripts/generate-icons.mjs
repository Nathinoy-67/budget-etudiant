// Génère les icônes PNG de la PWA à partir de scripts/icon.svg (npm run icons)
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const svg = await readFile(new URL('./icon.svg', import.meta.url));
const out = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

// Icônes "any" : coins arrondis transparents
const rounded = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#fff"/></svg>`);

async function any(size, file) {
  await sharp(svg).resize(size, size).composite([{ input: rounded(size), blend: 'dest-in' }]).png().toFile(out(file));
}
// Maskable : plein cadre, contenu réduit dans la zone de sécurité (80 %)
async function maskable(size, file) {
  const inner = Math.round(size * 0.78);
  const artSvg = Buffer.from(svg.toString().replace(/<rect width="512" height="512"[^>]*\/>/, ''));
  const art = await sharp(artSvg).resize(inner, inner).png().toBuffer();
  // Fond seul (dégradé), sans le dessin
  const bgSvg = Buffer.from(svg.toString().replace(/<!-- portefeuille -->[\s\S]*<\/svg>/, '</svg>'));
  const bg = await sharp(bgSvg).resize(size, size).png().toBuffer();
  await sharp(bg).composite([{ input: art, gravity: 'center' }]).png().toFile(out(file));
}
// apple-touch-icon : carré plein, iOS arrondit lui-même
async function full(size, file) {
  await sharp(svg).resize(size, size).flatten({ background: '#4F46E5' }).png().toFile(out(file));
}

await any(192, 'icons/icon-192.png');
await any(512, 'icons/icon-512.png');
await maskable(192, 'icons/maskable-192.png');
await maskable(512, 'icons/maskable-512.png');
await full(180, 'apple-touch-icon.png');
await full(180, 'icons/icon-180.png');
await writeFile(out('favicon.svg'), svg);
console.log('Icônes générées.');
