import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Rect, LayoutProfile, layoutProfileFor, FieldReading, GovernorGearSlotReading, LoadoutPayload, ScanKind,
  FixtureLabels, HeroGearPieceReading, ScanResult,
} from '../lib/scan/schemas.mjs';
import { CHARM_SLOTS } from '../lib/scan/kinds/governorProfile/gameData.mjs';

const rect = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
const profile = () => ({
  kind: 'governor_profile', version: 1,
  anchor: { type: 'rect', expected: rect },
  regions: { hat_quality: { id: 'hat_quality', rect, reader: 'quality', options: {} } },
});
const field = (value, confidence = 0.9) => ({ value, confidence, flags: [] });
const payload = () => ({ kind: 'governor_profile', source: 'scan', engine_version: '0.1.0', profile_version: 1, slots: { hat: { quality: 'gold', tier: 1, stars: 2 } } });

test('valid profile parses; kind restriction works', () => {
  assert.equal(LayoutProfile.safeParse(profile()).success, true);
  assert.equal(layoutProfileFor('backpack_gear').safeParse(profile()).success, false);
  assert.equal(ScanKind.safeParse('nope').success, false);
});

test('profile validation errors', () => {
  const noAnchor = profile(); delete noAnchor.anchor;
  assert.equal(LayoutProfile.safeParse(noAnchor).success, false);
  const out = profile(); out.regions.hat_quality.rect = { x: 0.9, y: 0.1, w: 0.3, h: 0.1 };
  assert.equal(LayoutProfile.safeParse(out).success, false);
  const tolerated = profile(); tolerated.regions.hat_quality.rect = { x: 0.9, y: 0.1, w: 0.1004, h: 0.1 };
  assert.equal(LayoutProfile.safeParse(tolerated).success, true);
  const badId = profile(); badId.regions.hat_quality.id = 'other';
  assert.equal(LayoutProfile.safeParse(badId).success, false);
  const extra = profile(); extra.surprise = 1;
  assert.equal(LayoutProfile.safeParse(extra).success, false);
  const badReader = profile(); badReader.regions.hat_quality.reader = 'magic';
  assert.equal(LayoutProfile.safeParse(badReader).success, false);
  const v0 = profile(); v0.version = 0;
  assert.equal(LayoutProfile.safeParse(v0).success, false);
  assert.equal(Rect.safeParse({ x: 0, y: 0, w: 0, h: 1 }).success, false);
  assert.equal(Rect.safeParse({ x: 0, y: 0, w: 1, h: 1, z: 1 }).success, false);
});

test('field and slot readings', () => {
  assert.equal(FieldReading.safeParse({ value: 'x', confidence: 1.2, flags: [] }).success, false);
  assert.equal(FieldReading.safeParse({ value: 'x', confidence: 0.5 }).success, true);
  const ok = { slot: 'hat', quality: field('gold'), tier: field(2), stars: field(3) };
  assert.equal(GovernorGearSlotReading.safeParse(ok).success, true);
  assert.equal(GovernorGearSlotReading.safeParse({ ...ok, slot: 'cape' }).success, false);
  assert.equal(GovernorGearSlotReading.safeParse({ ...ok, bonus: 1 }).success, false);
  assert.equal(HeroGearPieceReading.safeParse({ troop: field('infantry'), rarity: field('gold'), level: field(5), forgery: field(0) }).success, true);
  assert.equal(HeroGearPieceReading.safeParse({ troop: field('mage'), rarity: field('gold'), level: field(5), forgery: field(0) }).success, false);
  assert.equal(ScanResult.safeParse({ kind: 'governor_profile', status: 'not_implemented', engine_version: 'x', reasons: ['a'] }).success, true);
});

test('loadout payload limits and strictness', () => {
  assert.equal(LoadoutPayload.safeParse(payload()).success, true);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), member_id: 5 }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), source: 'ocr' }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), slots: { cape: { quality: 'gold', tier: 0, stars: 0 } } }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), slots: { hat: { quality: 'gold', tier: 0, stars: 4 } } }).success, false);
  const charms = CHARM_SLOTS.map((slot) => ({ slot, level: 22 }));
  assert.equal(LoadoutPayload.safeParse({ ...payload(), charms }).success, true);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), charms: [...charms, { slot: 'archer_1', level: 1 }] }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), charms: [{ slot: 'archer_1', level: 1 }, { slot: 'archer_1', level: 2 }] }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), charms: [{ slot: 'archer_1', level: 23 }] }).success, false);
  const hero = { kind: 'backpack_gear', source: 'scan', engine_version: 'x', profile_version: 1 };
  const pieces = (n) => Array.from({ length: n }, () => ({ troop: 'archer', level: 100, forgery: 20 }));
  assert.equal(LoadoutPayload.safeParse({ ...hero, heroGear: pieces(200) }).success, true);
  assert.equal(LoadoutPayload.safeParse({ ...hero, heroGear: pieces(201) }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...hero, heroGear: [{ troop: 'archer', level: 100, forgery: 21 }] }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...hero, heroGear: pieces(1), slots: {} }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), heroGear: pieces(1) }).success, false);
  const corr = { slot: 'hat', field: 'stars', read_value: 2, read_confidence: 0.5, corrected_value: 3 };
  assert.equal(LoadoutPayload.safeParse({ ...payload(), corrections: [corr] }).success, true);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), corrections: [{ ...corr, image: 'x' }] }).success, false);
  assert.equal(LoadoutPayload.safeParse({ ...payload(), corrections: Array(501).fill(corr) }).success, false);
});

test('fixture labels schema', () => {
  const ok = { version: 1, kind: 'governor_profile', images: { 'a.png': { gear: { hat: { quality: 'gold', tier: 1, stars: 2 } }, charms: { cavalry_1: 3 } } } };
  assert.equal(FixtureLabels.safeParse(ok).success, true);
  assert.equal(FixtureLabels.safeParse({ ...ok, version: 2 }).success, false);
  assert.equal(FixtureLabels.safeParse({ ...ok, extra: 1 }).success, false);
  assert.equal(FixtureLabels.safeParse({ ...ok, images: { 'a.png': { charms: { bogus_1: 3 } } } }).success, false);
});
