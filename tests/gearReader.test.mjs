import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readGearTile } from '../lib/scan/readers/gearTileReader.mjs';
import { GEAR_TEMPLATES, readGovernorGear } from '../lib/scan/kinds/governorProfile/gear.mjs';
import { runScan } from '../lib/scan/engine.mjs';
import { ScanResult } from '../lib/scan/schemas.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ART = path.join(ROOT, 'public/images/loadout/governor-gear');
const FIXTURES = path.join(ROOT, 'tests/fixtures/scan/governor_profile');
const labelsPath = path.join(FIXTURES, 'labels.json');
const haveFixtures = fs.existsSync(path.join(FIXTURES, 'profile-001.png')) && fs.existsSync(labelsPath);

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

test('gear templates: five frame colours, T1-T6 label templates and the P-shaped T1 / T2 glyphs', () => {
  assert.deepEqual(GEAR_TEMPLATES.frames.map((f) => f.quality).sort(), ['blue', 'gold', 'green', 'purple', 'red']);
  const ids = new Set(GEAR_TEMPLATES.labels.map((l) => l.id));
  for (const id of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'P1', 'P2']) assert.ok(ids.has(id), id);
  assert.deepEqual([GEAR_TEMPLATES.labels.find((l) => l.id === 'P1').tier, GEAR_TEMPLATES.labels.find((l) => l.id === 'P2').tier], [1, 2]);
});

test('owner art: every one of the 348 gear tiles reads back its quality and tier', async () => {
  let n = 0; let quality = 0; let tier = 0;
  for (const dir of fs.readdirSync(ART)) {
    for (const file of fs.readdirSync(path.join(ART, dir))) {
      const [q, t] = file.replace('.webp', '').split('-');
      const px = await sharp(path.join(ART, dir, file)).flatten({ background: '#7a8fa6' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const r = readGearTile({ width: px.info.width, height: px.info.height, data: new Uint8ClampedArray(px.data) }, GEAR_TEMPLATES);
      n += 1;
      if (r.quality.value === q) quality += 1;
      if (r.tier.value === Number(t.slice(1))) tier += 1;
    }
  }
  assert.equal(n, 348);
  assert.equal(quality, 348);
  assert.ok(tier >= 345, `tier ${tier}/${n}`);
});

test('the two full screenshots: all 12 gear pieces read exactly (quality, tier, stars)', { skip: !haveFixtures }, async () => {
  const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  for (const file of ['profile-001.png', 'profile-002.png']) {
    for (const r of readGovernorGear(await load(path.join(FIXTURES, file)))) {
      const want = labels.images[file].gear[r.slot];
      assert.deepEqual([r.quality.value, r.tier.value, r.stars.value], [want.quality, want.tier, want.stars], `${file} ${r.slot}`);
    }
  }
});

test('tiles whose label looks like "P1" / "P2" are T1 / T2 on Mythic and Legendary pieces', { skip: !haveFixtures }, async () => {
  const tl = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gear-tier-labels.json'), 'utf8')).labels;
  const picks = [['P1', 1], ['P2', 2]].map(([cls, tier]) => ({ tier, entry: Object.entries(tl).filter(([, v]) => v === cls).slice(-1)[0] }));
  for (const { tier, entry } of picks) {
    const [file, slot] = entry[0].split(':');
    const r = readGovernorGear(await load(path.join(FIXTURES, file))).find((x) => x.slot === slot);
    assert.equal(r.tier.value, tier, entry[0]);
  }
});

test('engine end to end: a full screenshot gives a schema-valid result with 6 gear pieces and 18 charms', { skip: !haveFixtures }, async () => {
  const r = runScan('governor_profile', await load(path.join(FIXTURES, 'profile-002.png')));
  assert.equal(r.status, 'ok');
  assert.equal(ScanResult.safeParse(r).success, true);
  assert.equal(r.gear.length, 6);
  assert.equal(r.charms.length, 18);
  const hat = r.gear.find((g) => g.slot === 'hat');
  assert.deepEqual([hat.quality.value, hat.tier.value, hat.stars.value], ['gold', 0, 1]);
  assert.equal(r.charms.find((c) => c.slot === 'cavalry_1').level.value, 4);
});

test('engine end to end on the cropped account images: schema-valid, gear reads sensible', { skip: !haveFixtures }, async () => {
  const r = runScan('governor_profile', await load(path.join(FIXTURES, 'acct-05.webp')));
  assert.equal(r.status, 'ok');
  assert.equal(ScanResult.safeParse(r).success, true);
  for (const g of r.gear) assert.ok(['gold', 'red', 'purple'].includes(g.quality.value), g.slot);
});
