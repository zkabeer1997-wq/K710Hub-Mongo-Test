// npm run scan:backpack: rebuild lib/scan/kinds/backpackInventory/templates.json from the labelled fixtures in
// tests/fixtures/scan/backpack-inventory/ (labels.json). Digit exemplars, label maps, category edge features and the
// three resource icons are all cut from real screenshots. Deterministic. Digits behind a translucent shield icon are
// skipped (the shield is not part of the digit shape); tiles whose digit count disagrees with the label are skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { locateTiles, cutTile } from '../lib/scan/kinds/backpackInventory/locate.mjs';
import { tileGlyphs, encodeGrid } from '../lib/scan/kinds/backpackInventory/digits.mjs';
import { labelMap, categoryFeature, iconFeature } from '../lib/scan/kinds/backpackInventory/tileReader.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tests', 'fixtures', 'scan', 'backpack-inventory');
const out = join(root, 'lib', 'scan', 'kinds', 'backpackInventory', 'templates.json');
const MAX_PER_DIGIT = 10;

async function loadTiles(file) {
  const { data, info } = await sharp(join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  return locateTiles(px).tiles.map((t) => cutTile(px, t));
}
const round = (a, d = 3) => a.map((v) => Math.round(v * 10 ** d) / 10 ** d);

const labels = JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8')).images;
const res = labels['resources.png'].backpack;
const spd = labels['speedups.png'].backpack;
const resTiles = await loadTiles('resources.png');
const spdTiles = await loadTiles('speedups.png');

// digits
const byDigit = {};
const skipped = [];
function harvest(source, tiles, quantities, shield = []) {
  tiles.forEach((tile, i) => {
    if (shield.includes(i)) return;
    const str = String(quantities[i]);
    const glyphs = tileGlyphs(tile);
    if (glyphs.length !== str.length) { skipped.push(`${source}#${i} (${str})`); return; }
    glyphs.forEach((g, k) => { (byDigit[str[k]] ||= []).push({ digit: str[k], source, i, grid: g.grid }); });
  });
}
harvest('resources.png', resTiles, res.quantities, res.shield);
harvest('speedups.png', spdTiles, spd.speedups.map((s) => s.quantity));
const digits = [];
for (const d of '0123456789') {
  const all = byDigit[d] || [];
  const a = all.filter((x) => x.source === 'speedups.png'); const b = all.filter((x) => x.source === 'resources.png');
  const mixed = [];
  for (let k = 0; mixed.length < Math.min(MAX_PER_DIGIT, all.length); k += 1) { if (a[k]) mixed.push(a[k]); if (mixed.length < MAX_PER_DIGIT && b[k]) mixed.push(b[k]); if (!a[k] && !b[k]) break; }
  for (const m of mixed) digits.push({ digit: d, source: `${m.source}#${m.i}`, b64: encodeGrid(m.grid) });
  if (!all.length) throw new Error(`no example of digit ${d}`);
}

// labels: two exemplars per denomination, from different categories
const labelTemplates = [];
for (const den of ['1m', '5m', '1h']) {
  const idx = spd.speedups.map((s, i) => ({ s, i })).filter((x) => x.s.denomination === den);
  for (const x of [idx[0], idx[Math.floor(idx.length / 2)]]) labelTemplates.push({ denomination: den, source: `speedups.png#${x.i}`, b64: encodeGrid(labelMap(spdTiles[x.i])) });
}
const categories = spd.speedups.map((s, i) => ({ category: s.category, source: `speedups.png#${i}`, feature: round(categoryFeature(spdTiles[i])) }));
const resources = ['tg', 'ttg', 'tg_dust'].map((item, i) => ({ item, source: `resources.png#${i}`, feature: round(iconFeature(resTiles[i]), 1) }));

writeFileSync(out, `${JSON.stringify({ version: 1, digits, labels: labelTemplates, categories, resources })}\n`);
console.log(`wrote ${out}: ${digits.length} digit exemplars, ${labelTemplates.length} labels, ${categories.length} categories, ${resources.length} resource icons`);
if (skipped.length) console.log(`digits skipped (count mismatch): ${skipped.join(', ')}`);
