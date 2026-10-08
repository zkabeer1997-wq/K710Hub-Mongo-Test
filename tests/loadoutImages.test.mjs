import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHARM_LEVELS, GOVERNOR_GEAR_STATES } from '../lib/scan/kinds/governorProfile/gameData.mjs';
import { GEAR_SLOT_ART, HAS_GEAR_ART, LOADOUT_TROOPS, charmImageFor, gearImageFor, gearImageKey, isArtlessState, sourceGearFileName } from '../lib/loadoutImages.mjs';
import { gearCaption, gearImageFor as gearImageForValue, LOADOUT_PIECES, loadoutSummaryLines } from '../lib/loadout.mjs';

const PUBLIC = path.resolve(import.meta.dirname, '../public');
const onDisk = (p) => fs.existsSync(path.join(PUBLIC, p));

const SLOTS = Object.keys(GEAR_SLOT_ART);
const ARTLESS = (slot, st) => slot === 'cavalry_2' && ((st.quality === 'red' && st.tier <= 2) || (st.quality === 'gold' && st.tier === 3));

test('all six slots have an art folder; no stand-in files or flags exist', () => {
  assert.deepEqual(Object.keys(HAS_GEAR_ART).sort(), ['archer_1', 'archer_2', 'cavalry_1', 'cavalry_2', 'infantry_1', 'infantry_2']);
  assert.deepEqual(LOADOUT_PIECES.map((p) => GEAR_SLOT_ART[p.gearKey].piece), LOADOUT_PIECES.map((p) => p.id));
  for (const slot of SLOTS) assert.equal(fs.existsSync(path.join(PUBLIC, 'images/loadout/governor-gear', GEAR_SLOT_ART[slot].folder, 'red-base-standin.webp')), false);
});

test('58 states x 6 slots resolve to an existing real file, except the 16 pendant states the guide could not show unlocked', () => {
  assert.equal(GOVERNOR_GEAR_STATES.length, 58);
  const seen = new Set();
  let none = 0;
  for (const slot of SLOTS) {
    for (const state of GOVERNOR_GEAR_STATES) {
      const p = gearImageFor(slot, state);
      assert.equal(typeof p === 'string' || p === null, true, 'plain path or null');
      if (ARTLESS(slot, state)) { assert.equal(p, null); assert.equal(isArtlessState(slot, state), true); none++; continue; }
      assert.ok(p, `${slot} ${state.label}`);
      assert.ok(onDisk(p), `missing ${p}`);
      assert.equal(gearImageForValue(slot, state.label), p, 'stored string and structured state agree');
      seen.add(p);
    }
  }
  assert.equal(none, 16);
  assert.equal(seen.size, 58 * 6 - 16);
});

test('path naming: lowercase quality, tier and stars; purple T1 is quality purple tier 1', () => {
  assert.equal(gearImageFor('cavalry_1', { quality: 'gold', tier: 3, stars: 3 }), '/images/loadout/governor-gear/cavalry/gold-t3-s3.webp');
  assert.equal(gearImageFor('archer_1', { quality: 'green', tier: 0, stars: 1 }), '/images/loadout/governor-gear/archer/green-t0-s1.webp');
  assert.equal(gearImageForValue('infantry_1', 'Purple T1 2 stars'), '/images/loadout/governor-gear/infantry/purple-t1-s2.webp');
  assert.equal(gearImageForValue('cavalry_1', 'Red T6 ★★★'), '/images/loadout/governor-gear/cavalry/red-t6-s3.webp');
});

test('new-piece paths use the -2 folders; blank and invalid gear resolve to null', () => {
  assert.equal(gearImageFor('cavalry_2', { quality: 'gold', tier: 1, stars: 1 }), '/images/loadout/governor-gear/cavalry-2/gold-t1-s1.webp');
  assert.equal(gearImageForValue('infantry_2', 'Red T5 ★★'), '/images/loadout/governor-gear/infantry-2/red-t5-s2.webp');
  assert.equal(gearImageForValue('archer_2', 'Red T6 ★★★'), '/images/loadout/governor-gear/archer-2/red-t6-s3.webp');
  assert.equal(gearImageForValue('cavalry_2', 'Gold T3 ★'), null, 'pendant Gold T3 has no clean art yet');
  assert.equal(gearImageForValue('cavalry_2', 'Red T1'), null);
  assert.ok(gearImageForValue('cavalry_2', 'Red T3 ★'));
  assert.equal(gearImageForValue('nope_9', 'Gold T1 ★'), null);
  assert.equal(gearImageForValue('cavalry_1', ''), null);
  assert.equal(gearImageForValue('cavalry_1', 'Gold T9 ★'), null);
  assert.equal(gearImageFor('cavalry_1', { quality: 'green', tier: 0, stars: 2 }), null);
  assert.equal(gearImageKey(null), null);
});

test('22 charm levels x 3 troops resolve to existing files; unset or invalid is null', () => {
  for (const troop of LOADOUT_TROOPS) {
    for (const level of CHARM_LEVELS) {
      const p = charmImageFor(troop, level);
      assert.equal(p, `/images/loadout/charms/${troop}/level-${level}.webp`);
      assert.ok(onDisk(p), `missing ${p}`);
      assert.equal(charmImageFor(troop, `Level ${level}`), p);
      assert.equal(charmImageFor(troop, String(level)), p);
    }
    assert.equal(charmImageFor(troop, ''), null);
    assert.equal(charmImageFor(troop, 'Level 23'), null);
    assert.equal(charmImageFor(troop, undefined), null);
  }
  assert.equal(charmImageFor('mage', 1), null);
});

test('source file names follow the owner naming (T<tier><stars>)', () => {
  const name = (q, t, s) => sourceGearFileName({ tier: t, stars: s }, q);
  assert.equal(name('Gold', 0, 3), 'Gold 3.jpg');
  assert.equal(name('Gold', 1, 0), 'Gold T10.jpg');
  assert.equal(name('Gold', 3, 3), 'Gold T33.jpg');
  assert.equal(name('Purple', 1, 2), 'Purple T12.jpg');
  assert.equal(name('Red', 6, 3), 'Red T63.jpg');
});

test('manifest: every entry exists, sources are owner-art or gear-guide-screenshot, no stand-ins, composited tiles flagged', () => {
  const m = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'images/loadout/manifest.json'), 'utf8'));
  for (const troop of LOADOUT_TROOPS) {
    assert.equal(Object.keys(m.governorGear[troop]).length, 58);
    assert.equal(Object.keys(m.charms[troop]).length, 22);
    for (const p of Object.values(m.charms[troop])) assert.ok(onDisk(p), p);
  }
  let total = 0;
  for (const slot of SLOTS) {
    const { folder, piece } = GEAR_SLOT_ART[slot];
    const paths = m.governorGear[folder];
    const entries = m.governorGearEntries[folder];
    const expected = GOVERNOR_GEAR_STATES.filter((s) => !ARTLESS(slot, s)).length;
    assert.equal(Object.keys(paths).length, expected, folder);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(paths).sort());
    assert.equal(m.pieces[folder].piece, piece);
    for (const [key, p] of Object.entries(paths)) {
      assert.ok(onDisk(p), p);
      assert.notEqual(entries[key].source, 'stand-in');
      assert.ok(['owner-art', 'gear-guide-screenshot'].includes(entries[key].source), `${folder} ${key}`);
      assert.equal(entries[key].piece, piece);
      assert.ok(!('standIn' in entries[key]));
      if (entries[key].composited) assert.equal(entries[key].usableAsTemplate, false);
    }
    const sources = Object.values(entries).filter((e) => e.source === 'gear-guide-screenshot').length;
    if (folder.endsWith('-2')) assert.equal(entries[`red-t6-s3`]?.source ?? 'owner-art', 'owner-art');
    else assert.equal(sources, 0);
  }
  for (const f of fs.readdirSync(path.join(PUBLIC, 'images/loadout/governor-gear'), { recursive: true })) {
    if (String(f).endsWith('.webp')) total += fs.statSync(path.join(PUBLIC, 'images/loadout/governor-gear', String(f))).size;
  }
  assert.ok(total < 8 * 1024 * 1024, `gear art weighs ${total} bytes`);
  assert.equal(JSON.stringify(m).includes('stand-in'), false);
});

test('caption text carries quality, tier and stars without colour', () => {
  assert.equal(gearCaption('Gold T3 ★★★'), 'Gold T3 ★★★');
  assert.equal(gearCaption('Green'), 'Green');
  assert.equal(gearCaption('Blue 2 stars'), 'Blue ★★');
  assert.equal(gearCaption(''), '');
});

test('screen-reader summary lists all six pieces and eighteen charms', () => {
  const lines = loadoutSummaryLines({ cavalry_1: 'Gold T3 2 stars' }, { cavalry_1: 'Level 9' });
  assert.equal(lines.length, 6);
  assert.equal(lines[1], 'Shirt: no gear; charms not set, not set, not set');
  const gear = { cavalry_1: 'Gold T3 ★★' };
  assert.equal(loadoutSummaryLines(gear, { cavalry_1: 'Level 9' })[0], 'Hat: Gold T3, 2 stars; charms 9, not set, not set');
});
