import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  readCharmLevel, decodeCharmExemplars, ART_ONLY_CONFIDENCE_CAP, CHARM_GRID,
} from '../lib/scan/readers/charmReader.mjs';
import { CHARM_TEMPLATES, readGovernorCharms, CHARM_LEVELS_SEEN_IN_REAL_SCREENSHOTS } from '../lib/scan/kinds/governorProfile/charms.mjs';
import { charmRegions } from '../lib/scan/kinds/governorProfile/layout.mjs';
import { CHARM_SLOTS } from '../lib/scan/kinds/governorProfile/gameData.mjs';
import { crop } from '../lib/scan/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures/scan/governor_profile');

test('charm templates: 22 levels for each of the three troops', () => {
  assert.deepEqual(Object.keys(CHARM_TEMPLATES).sort(), ['archer', 'cavalry', 'infantry']);
  for (const list of Object.values(CHARM_TEMPLATES)) {
    assert.deepEqual(list.map((t) => t.level), Array.from({ length: 22 }, (_, i) => i + 1));
    for (const t of list) { assert.equal(t.mask.length, CHARM_GRID * CHARM_GRID); assert.ok(t.aspect > 0.4 && t.aspect < 2); }
  }
});

test('charm layout: 18 slots, the same keys as the form, all windows inside the image', () => {
  const regions = charmRegions();
  assert.deepEqual(regions.map((r) => r.slot).sort(), [...CHARM_SLOTS].sort());
  for (const r of regions) {
    assert.ok(r.rect.x >= 0 && r.rect.y >= 0 && r.rect.x + r.rect.w <= 1 && r.rect.y + r.rect.h <= 1, r.slot);
  }
});

test('a plain background has no gem: value null, confidence 0', () => {
  const w = 66; const h = 68; const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { data[i * 4] = 190; data[i * 4 + 1] = 210; data[i * 4 + 2] = 230; data[i * 4 + 3] = 255; }
  const res = readCharmLevel({ width: w, height: h, data }, 'cavalry', CHARM_TEMPLATES);
  assert.equal(res.value, null);
  assert.equal(res.confidence, 0);
});

// Synthetic check: the supplied art, scaled to the in-game size, blurred, on a gradient background.
// It measures how separable the 22 shapes are. It is NOT a measure of accuracy on real screenshots.
test('synthetic: art-only reader separates the 22 levels (>= 93%) and never reports one confidently', async () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const W = 100; const H = 100;
  let ok = 0; let n = 0; let confidentWrong = 0; let tooConfident = 0;
  for (const troop of ['cavalry', 'infantry', 'archer']) {
    for (let level = 1; level <= 22; level += 1) {
      for (let rep = 0; rep < 3; rep += 1) {
        const size = Math.round(384 * 0.164 * (0.9 + rnd() * 0.2));
        const art = await sharp(path.join(ROOT, `public/images/loadout/charms/${troop}/level-${level}.webp`)).resize(size, size).blur(0.5 + rnd() * 0.4).png().toBuffer();
        const bg = Buffer.alloc(W * H * 3);
        const c0 = [150 + rnd() * 80, 180 + rnd() * 50, 200 + rnd() * 50]; const gx = (rnd() - 0.5) * 40; const gy = (rnd() - 0.5) * 40;
        for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) for (let c = 0; c < 3; c += 1) bg[(y * W + x) * 3 + c] = Math.max(0, Math.min(255, c0[c] + (gx * x) / W + (gy * y) / H + (rnd() - 0.5) * 6));
        const left = Math.round((W - size) / 2 + (rnd() - 0.5) * 4); const top = Math.round((H - size) / 2 + (rnd() - 0.5) * 4);
        const raw = await sharp(bg, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: art, left, top }]).ensureAlpha().raw().toBuffer();
        const window = crop({ width: W, height: H, data: new Uint8ClampedArray(raw) }, { x: (W - 66) / 2, y: (H - 68) / 2, w: 66, h: 68 });
        const res = readCharmLevel(window, troop, CHARM_TEMPLATES, []);
        n += 1;
        if (res.value === level) ok += 1; else if (res.confidence >= 0.8) confidentWrong += 1;
        if (res.confidence > ART_ONLY_CONFIDENCE_CAP) tooConfident += 1;
      }
    }
  }
  assert.ok(ok / n >= 0.93, `synthetic accuracy ${ok}/${n}`);
  assert.equal(confidentWrong, 0);
  assert.equal(tooConfident, 0, 'art-only levels must stay under the review threshold');
});

async function loadFixture(file) {
  const { data, info } = await sharp(path.join(FIXTURES, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

const labelsPath = path.join(FIXTURES, 'labels.json');
const haveFixtures = fs.existsSync(labelsPath);

test('real screenshots (leave-one-image-out): accuracy and confident mistakes stay within the measured bounds', { skip: !haveFixtures }, async () => {
  const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const exemplarJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/scan/kinds/governorProfile/charmExemplars.json'), 'utf8'));
  let n = 0; let right = 0; let confident = 0; let confidentWrong = 0;
  for (const [file, lab] of Object.entries(labels.images)) {
    if (!lab.charms || !fs.existsSync(path.join(FIXTURES, file))) continue;
    const exemplars = decodeCharmExemplars({ ...exemplarJson, items: exemplarJson.items.filter((i) => i.source !== file) });
    for (const { slot, level } of readGovernorCharms(await loadFixture(file), { exemplars })) {
      if (lab.charms[slot] == null) continue;
      n += 1;
      if (level.value === lab.charms[slot]) right += 1;
      if (level.confidence >= 0.8) { confident += 1; if (level.value !== lab.charms[slot]) confidentWrong += 1; }
    }
  }
  // measured at 612/689 right, 467 confident, 8 confident-and-wrong (some of those are label noise)
  assert.ok(n >= 600, `labelled gems: ${n}`);
  assert.ok(right / n >= 0.86, `accuracy ${right}/${n}`);
  assert.ok(confident / n >= 0.6, `confident share ${confident}/${n}`);
  assert.ok(confidentWrong / confident <= 0.025, `confident and wrong ${confidentWrong}/${confident}`);
});

test('locator finds all six gem rows on the real screenshots, at the same gem pitch', { skip: !haveFixtures }, async () => {
  const { locateCharmRows } = await import('../lib/scan/kinds/governorProfile/locate.mjs');
  for (const file of ['profile-001.png', 'profile-002.png']) {
    const found = locateCharmRows(await loadFixture(file));
    assert.equal(found.rows.length, 6, `${file}: ${found.missing.join(',')}`);
    assert.ok(Math.abs(found.scale - 60) <= 1.5, `pitch ${found.scale}`);
  }
});

test('levels with real exemplars (everything else is art-only and capped for review)', () => {
  assert.deepEqual(CHARM_LEVELS_SEEN_IN_REAL_SCREENSHOTS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
});
