import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { runScan } from '../lib/scan/engine.mjs';
import { locateTiles, cutTile } from '../lib/scan/kinds/backpackInventory/locate.mjs';
import { readQuantity } from '../lib/scan/kinds/backpackInventory/digits.mjs';
import { harvestDigitTemplates } from '../lib/scan/kinds/backpackInventory/evalTools.mjs';
import { daysFromMinutes, MINUTES_BY_DENOMINATION } from '../lib/scan/kinds/backpackInventory/gameData.mjs';
import { validateReading } from '../lib/scan/validate.mjs';

const DIR = path.resolve(import.meta.dirname, 'fixtures/scan/backpack-inventory');
const labels = JSON.parse(fs.readFileSync(path.join(DIR, 'labels.json'), 'utf8')).images;

async function load(file, edit = (s) => s) {
  const { data, info } = await edit(sharp(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}
const scan = (file, edit) => load(path.join(DIR, file), edit).then((p) => runScan('backpack_inventory', p));

test('resources screenshot: TG, TTG and TG Dust read exactly, nothing else is reported', async () => {
  const r = await scan('resources.png');
  assert.equal(r.status, 'ok');
  assert.equal(r.tab, 'resources');
  assert.deepEqual([r.resources.tg.value, r.resources.ttg.value, r.resources.tg_dust.value], [8018, 280, 11]);
  for (const id of ['tg', 'ttg', 'tg_dust']) { assert.equal(r.resources[id].found, true); assert.ok(r.resources[id].confidence >= 0.8, id); }
  assert.equal(r.speedups.length, 0);
});

test('speedups screenshot: all 14 rows exact, with the days from the owner', async () => {
  const r = await scan('speedups.png');
  assert.equal(r.status, 'ok');
  assert.equal(r.tab, 'speedups');
  const truth = labels['speedups.png'].backpack.speedups;
  assert.equal(r.speedups.length, truth.length);
  r.speedups.forEach((s, i) => {
    assert.equal(s.denomination.value, truth[i].denomination, `row ${i} denomination`);
    assert.equal(s.category.value, truth[i].category, `row ${i} category`);
    assert.equal(s.quantity.value, truth[i].quantity, `row ${i} quantity`);
    for (const f of [s.denomination, s.category, s.quantity]) assert.ok(f.confidence >= 0.8, `row ${i} confidence`);
  });
  const minutes = {};
  for (const s of r.speedups) minutes[s.category.value] = (minutes[s.category.value] || 0) + MINUTES_BY_DENOMINATION[s.denomination.value] * s.quantity.value;
  assert.equal(minutes.troop, 3593);
  assert.equal(minutes.general, 2500);
  assert.equal((daysFromMinutes(minutes.troop)).toFixed(2), '2.50');
  assert.equal((daysFromMinutes(minutes.troop + minutes.general)).toFixed(2), '4.23');
});

test('held out: digits read with templates cut only from the OTHER screenshot', async () => {
  const tilesOf = {};
  for (const f of ['resources.png', 'speedups.png']) {
    const px = await load(path.join(DIR, f));
    tilesOf[f] = locateTiles(px).tiles.map((t) => cutTile(px, t));
  }
  const q = (f) => labels[f].backpack.quantities ?? labels[f].backpack.speedups.map((s) => s.quantity);
  for (const [test_, train] of [['speedups.png', 'resources.png'], ['resources.png', 'speedups.png']]) {
    const shield = labels[test_].backpack.shield ?? [];
    const { templates } = harvestDigitTemplates(tilesOf[train], q(train), { source: train, skip: labels[train].backpack.shield ?? [] });
    tilesOf[test_].forEach((tile, i) => {
      const r = readQuantity(tile, templates);
      if (shield.includes(i)) { if (r.value !== q(test_)[i]) assert.ok(r.confidence < 0.8, `${test_}#${i}: wrong shield-tile read must be flagged`); return; }
      assert.equal(r.value, q(test_)[i], `${test_}#${i}`);
    });
  }
});

test('re-encoded screenshots (smaller, JPEG, cropped) still read exactly or are flagged', async () => {
  const edits = {
    '1080 wide': (s) => s.resize({ width: 1080, kernel: 'lanczos3' }),
    '828 wide': (s) => s.resize({ width: 828, kernel: 'lanczos3' }),
    'cropped sides': (s) => s.extract({ left: 40, top: 420, width: 1204, height: 1200 }),
  };
  for (const [name, edit] of Object.entries(edits)) {
    const r = await scan('resources.png', edit);
    assert.deepEqual([r.resources.tg.value, r.resources.ttg.value, r.resources.tg_dust.value], [8018, 280, 11], name);
    const s = await scan('speedups.png', edit);
    const truth = labels['speedups.png'].backpack.speedups;
    s.speedups.forEach((row, i) => assert.equal(row.quantity.value, truth[i].quantity, `${name} row ${i}`));
  }
  const jpegBuf = await sharp(path.join(DIR, 'speedups.png')).jpeg({ quality: 60 }).toBuffer();
  const { data, info } = await sharp(jpegBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = runScan('backpack_inventory', { width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
  const truth = labels['speedups.png'].backpack.speedups;
  r.speedups.forEach((row, i) => { if (row.quantity.value !== truth[i].quantity) assert.ok(row.quantity.confidence < 0.8); });
});

test('a cropped screenshot with only some rows reads those rows', async () => {
  const r = await scan('speedups.png', (s) => s.extract({ left: 0, top: 380, width: 1284, height: 1000 }));
  assert.equal(r.status, 'ok');
  assert.equal(r.speedups.length, 12);
});

test('a screenshot of something else fails with a friendly reason and reads nothing', async () => {
  const fixture = path.resolve(import.meta.dirname, 'fixtures/scan/governor_profile');
  const file = fs.readdirSync(fixture).find((f) => /\.(png|webp)$/.test(f));
  const r = runScan('backpack_inventory', await load(path.join(fixture, file)));
  assert.equal(r.status, 'failed');
  assert.match(r.reasons[0], /Backpack/);
  assert.equal(r.resources, undefined);
  const blank = { width: 600, height: 900, data: new Uint8ClampedArray(600 * 900 * 4).fill(200) };
  assert.equal(runScan('backpack_inventory', blank).status, 'failed');
  assert.equal(runScan('backpack_inventory', { width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4) }).status, 'invalid_image');
});

test('a resources screenshot scrolled past TG / TTG / TG Dust reports "not found", never 0', async () => {
  // keep only the lower tile rows (rows 3+), which hold none of the three items
  const r = await scan('resources.png', (s) => s.extract({ left: 0, top: 1330, width: 1284, height: 1100 }));
  assert.equal(r.status, 'ok');
  for (const id of ['tg', 'ttg', 'tg_dust']) {
    assert.equal(r.resources[id].found, false);
    assert.equal(r.resources[id].value, null);
  }
  assert.match(r.reasons[0], /not on this screenshot/);
});

test('validate: never changes a value, flags impossible ones', () => {
  const f = (value, confidence = 1) => ({ value, confidence, flags: [] });
  const ok = validateReading('backpack_inventory', { denomination: f('5m'), category: f('troop'), quantity: f(272) });
  assert.equal(ok.quantity.value, 272);
  assert.equal(ok.quantity.confidence, 1);
  const bad = validateReading('backpack_inventory', { denomination: f('9h'), category: f('pizza'), quantity: f(-3) });
  assert.equal(bad.denomination.value, '9h');
  assert.ok(bad.denomination.confidence < 0.8 && bad.category.confidence < 0.8 && bad.quantity.confidence < 0.8);
});
