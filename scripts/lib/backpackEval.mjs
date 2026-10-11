// scan:eval for backpack_inventory. Three honest views, because there are only two screenshots:
//   1. As shipped (templates cut from both screenshots): in-sample, so it proves wiring, not generalisation.
//   2. Held out: digits read with templates cut ONLY from the other screenshot; label and category read leave-one-tile-out.
//      (TG / TTG / TG Dust icons have a single exemplar each, so they cannot be held out; see 3.)
//   3. Robustness: the same screenshots re-encoded (smaller, larger, JPEG, cropped) and read with the shipped templates.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { runScan } from '../../lib/scan/engine.mjs';
import { locateTiles, cutTile } from '../../lib/scan/kinds/backpackInventory/locate.mjs';
import { harvestDigitTemplates } from '../../lib/scan/kinds/backpackInventory/evalTools.mjs';
import { readQuantity } from '../../lib/scan/kinds/backpackInventory/digits.mjs';
import { labelMap, labelDistance, categoryFeature } from '../../lib/scan/kinds/backpackInventory/tileReader.mjs';
import { REVIEW_THRESHOLD } from '../../lib/scan/review.mjs';

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}% (${a}/${b})` : 'n/a');

async function toPixels(img) {
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

export const VARIANTS = {
  original: (file) => sharp(file),
  'width 1080': (file) => sharp(file).resize({ width: 1080, kernel: 'lanczos3' }),
  'width 828': (file) => sharp(file).resize({ width: 828, kernel: 'lanczos3' }),
  'width 720': (file) => sharp(file).resize({ width: 720 }),
  'width 1500 (enlarged)': (file) => sharp(file).resize({ width: 1500 }),
  'JPEG quality 60': async (file) => sharp(await sharp(file).jpeg({ quality: 60 }).toBuffer()),
  'cropped top rows': (file) => sharp(file).extract({ left: 0, top: 380, width: 1284, height: 1000 }),
  'cropped sides': (file) => sharp(file).extract({ left: 40, top: 420, width: 1204, height: 1200 }),
};

function scoreScan(result, labels, file, stat, failures, tag, allowMissing = false) {
  const want = labels.images[file].backpack;
  if (result.status !== 'ok') { failures.push(`${tag} ${file}: ${result.status}`); return; }
  const bump = (key, ok, conf) => {
    const s = stat.get(key) ?? { ok: 0, n: 0, confidentWrong: 0, flaggedRight: 0, flagged: 0 };
    s.n += 1; if (ok) s.ok += 1;
    const flagged = conf < REVIEW_THRESHOLD;
    if (flagged) { s.flagged += 1; if (ok) s.flaggedRight += 1; } else if (!ok) s.confidentWrong += 1;
    stat.set(key, s);
    if (!ok) failures.push(`${tag} ${file} ${key}: wrong (confidence ${conf})`);
  };
  if (want.tg !== undefined && result.resources) {
    for (const id of ['tg', 'ttg', 'tg_dust']) bump(`resource.${id}`, result.resources[id].value === want[id], result.resources[id].confidence);
  }
  if (want.speedups && result.speedups) {
    const used = new Set();
    for (const t of want.speedups) {
      const i = result.speedups.findIndex((s, k) => !used.has(k) && s.denomination.value === t.denomination && s.category.value === t.category);
      if (i < 0) { if (!allowMissing) bump('speedup.found', false, 1); continue; }
      used.add(i);
      const s = result.speedups[i];
      bump('speedup.quantity', s.quantity.value === t.quantity, Math.min(s.quantity.confidence, s.denomination.confidence, s.category.confidence));
    }
    // denomination and category are matched by value above; also count rows read with a label that exists nowhere in the labels
    const extra = result.speedups.length - used.size;
    if (extra) failures.push(`${tag} ${file}: ${extra} extra speedup row(s)`);
  }
}

export async function evalBackpackInventory(dir, loadPixels) {
  const labels = JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8'));
  const files = Object.keys(labels.images);
  console.log('\nbackpack_inventory');
  const failures = [];
  // 1 + 3: as shipped, original and re-encoded
  for (const [name, make] of Object.entries(VARIANTS)) {
    const stat = new Map();
    for (const file of files) {
      const img = await make(join(dir, file));
      scoreScan(runScan('backpack_inventory', await toPixels(img)), labels, file, stat, failures, `[${name}]`, name.startsWith('cropped'));
    }
    const parts = [...stat.entries()].map(([k, s]) => `${k} ${pct(s.ok, s.n)}${s.confidentWrong ? ` CONFIDENT-WRONG ${s.confidentWrong}` : ''}${s.flagged ? ` flagged ${s.flagged}` : ''}`);
    console.log(`  ${name === 'original' ? 'as shipped (in-sample)' : `re-encoded: ${name}`}: ${parts.join('; ')}`);
  }
  // 2: held-out digits
  const tilesOf = {};
  for (const file of files) {
    const px = await loadPixels(join(dir, file));
    tilesOf[file] = locateTiles(px).tiles.map((t) => cutTile(px, t));
  }
  const qOf = (file) => { const b = labels.images[file].backpack; return b.quantities ?? b.speedups.map((s) => s.quantity); };
  let ok = 0; let n = 0; let okShield = 0; let nShield = 0; let confidentWrong = 0;
  for (const test of files) {
    const train = files.filter((f) => f !== test);
    const templates = train.flatMap((f) => harvestDigitTemplates(tilesOf[f], qOf(f), { source: f, skip: labels.images[f].backpack.shield ?? [] }).templates);
    const shield = labels.images[test].backpack.shield ?? [];
    tilesOf[test].forEach((tile, i) => {
      const r = readQuantity(tile, templates);
      const good = r.value === qOf(test)[i];
      if (shield.includes(i)) { nShield += 1; if (good) okShield += 1; } else { n += 1; if (good) ok += 1; }
      if (!good && r.confidence >= REVIEW_THRESHOLD) confidentWrong += 1;
      if (!good) failures.push(`[held-out digits] ${test}#${i}: expected ${qOf(test)[i]}, read ${r.text || '(nothing)'} (confidence ${r.confidence})`);
    });
  }
  console.log(`  held-out quantity (templates from the OTHER screenshot only): ${pct(ok, n)} on clean tiles; ${pct(okShield, nShield)} on tiles with a shield icon behind the digits (not scheduler items); confident-and-wrong ${confidentWrong}`);
  // 2: leave-one-tile-out label and category (speedups screenshot)
  const sp = files.find((f) => labels.images[f].backpack.speedups);
  const rows = labels.images[sp].backpack.speedups;
  const maps = tilesOf[sp].map(labelMap); const feats = tilesOf[sp].map(categoryFeature);
  let denomOk = 0; let catOk = 0;
  rows.forEach((row, i) => {
    let bestD = [9, null]; let bestC = [1e9, null];
    rows.forEach((other, j) => {
      if (j === i) return;
      const d = labelDistance(maps[i], maps[j]); if (d < bestD[0]) bestD = [d, other.denomination];
      const c = feats[i].reduce((s, v, k) => s + Math.abs(v - feats[j][k]), 0); if (c < bestC[0]) bestC = [c, other.category];
    });
    if (bestD[1] === row.denomination) denomOk += 1; else failures.push(`[leave-one-out] denomination #${i}`);
    if (bestC[1] === row.category) catOk += 1; else failures.push(`[leave-one-out] category #${i}`);
  });
  console.log(`  leave-one-tile-out: denomination ${pct(denomOk, rows.length)}, category ${pct(catOk, rows.length)}`);
  console.log('  not testable with 2 screenshots: TG / TTG / TG Dust icons (one exemplar each), grey general 1-min tiles, other phone models, any tile not in these images');
  if (failures.length) { console.log('  failures:'); for (const f of failures.slice(0, 40)) console.log(`    ${f}`); }
}
