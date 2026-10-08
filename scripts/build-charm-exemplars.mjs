// Cuts the real charm gems out of the labelled Governor Profile screenshots
// (tests/fixtures/scan/governor_profile) into lib/scan/kinds/governorProfile/charmExemplars.json.
// The art alone does not match the in-game rendering for every level (e.g. level 12 wings are wider
// in game), so every level seen on a real screenshot also gets a real exemplar. Only gem pixels are
// stored: no names, IDs or screenshots. Re-run whenever fixtures change:  npm run scan:charms
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CHARM_GRID, harvestExemplar } from '../lib/scan/readers/charmReader.mjs';
import { charmWindows } from '../lib/scan/kinds/governorProfile/charms.mjs';
import { crop } from '../lib/scan/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'tests/fixtures/scan/governor_profile');
const OUT = path.join(ROOT, 'lib/scan/kinds/governorProfile/charmExemplars.json');
const PER_IMAGE_LEVEL = 2;
// Cap per level (any troop: the silhouette is the same for all three). Round-robin over troops and images so the
// few kept examples cover different backgrounds, and the bundle stays small.
const PER_LEVEL = 12;

const labels = JSON.parse(fs.readFileSync(path.join(DIR, 'labels.json'), 'utf8'));
const candidates = [];
for (const [file, lab] of Object.entries(labels.images)) {
  const src = path.join(DIR, file);
  if (!fs.existsSync(src) || !lab.charms) continue;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const taken = new Map();
  for (const region of charmWindows(px)) {
    const level = lab.charms[region.slot];
    if (!level) continue;
    const key = `${region.troop}:${level}`;
    if ((taken.get(key) || 0) >= PER_IMAGE_LEVEL) continue;
    const ex = harvestExemplar(crop(px, region.rect), region.troop, level);
    if (!ex) continue;
    taken.set(key, (taken.get(key) || 0) + 1);
    candidates.push({ ...ex, source: file });
  }
}
const items = [];
const byLevel = new Map();
for (const c of candidates) { if (!byLevel.has(c.level)) byLevel.set(c.level, []); byLevel.get(c.level).push(c); }
for (const [, list] of [...byLevel].sort((a, b) => a[0] - b[0])) {
  const queues = new Map();
  for (const c of list) { const k = `${c.troop}|${c.source}`; if (!queues.has(k)) queues.set(k, []); queues.get(k).push(c); }
  const order = [...queues.values()];
  let picked = 0;
  for (let round = 0; picked < PER_LEVEL; round += 1) {
    let any = false;
    for (const q of order) { if (q[round] && picked < PER_LEVEL) { items.push(q[round]); picked += 1; any = true; } }
    if (!any) break;
  }
}
fs.writeFileSync(OUT, `${JSON.stringify({ version: 1, grid: CHARM_GRID, items })}\n`);
const levels = [...new Set(items.map((i) => i.level))].sort((a, b) => a - b);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${items.length} exemplars, levels ${levels.join(', ')}`);
