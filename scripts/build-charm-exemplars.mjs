// Cuts the real charm gems out of the labelled Governor Profile screenshots
// (tests/fixtures/scan/governor_profile) into lib/scan/kinds/governorProfile/charmExemplars.json.
// The art alone does not match the in-game rendering for every level (e.g. level 12 wings are wider
// in game), so every level seen on a real screenshot also gets a real exemplar. Only gem pixels are
// stored: no names, IDs or screenshots. Re-run whenever fixtures change:  npm run scan:charms
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CHARM_GRID, harvestExemplar } from '../lib/scan/readers/charmReader.mjs';
import { charmRegions } from '../lib/scan/kinds/governorProfile/layout.mjs';
import { normToPx } from '../lib/scan/coords.mjs';
import { crop } from '../lib/scan/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'tests/fixtures/scan/governor_profile');
const OUT = path.join(ROOT, 'lib/scan/kinds/governorProfile/charmExemplars.json');
const PER_IMAGE_LEVEL = 2;

const labels = JSON.parse(fs.readFileSync(path.join(DIR, 'labels.json'), 'utf8'));
const items = [];
for (const [file, lab] of Object.entries(labels.images)) {
  const src = path.join(DIR, file);
  if (!fs.existsSync(src) || !lab.charms) continue;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const taken = new Map();
  for (const region of charmRegions()) {
    const level = lab.charms[region.slot];
    if (!level) continue;
    const key = `${region.troop}:${level}`;
    if ((taken.get(key) || 0) >= PER_IMAGE_LEVEL) continue;
    const rect = normToPx(region.rect, { x0: 0, y0: 0, scale: info.width, aspect: info.height / info.width }, info);
    const ex = harvestExemplar(crop(px, rect), region.troop, level);
    if (!ex) continue;
    taken.set(key, (taken.get(key) || 0) + 1);
    items.push({ ...ex, source: file });
  }
}
fs.writeFileSync(OUT, `${JSON.stringify({ version: 1, grid: CHARM_GRID, items })}\n`);
const levels = [...new Set(items.map((i) => i.level))].sort((a, b) => a - b);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${items.length} exemplars, levels ${levels.join(', ')}`);
