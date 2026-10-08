import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReading, needsReview } from '../lib/scan/validate.mjs';
import { getKind, KINDS } from '../lib/scan/kinds/index.mjs';
import { runScan, ENGINE_VERSION } from '../lib/scan/engine.mjs';

const f = (value, confidence = 0.95) => ({ value, confidence, flags: [] });
const slot = (q, t, s) => ({ slot: 'hat', quality: f(q), tier: f(t), stars: f(s) });

test('valid gear reading is untouched and not flagged', () => {
  const r = slot('gold', 3, 3);
  assert.deepEqual(validateReading('governor_profile', r), r);
  assert.equal(needsReview(r), false);
});

test('impossible states lower confidence but never change values', () => {
  const r = slot('green', 3, 1);
  const v = validateReading('governor_profile', r);
  assert.equal(v.quality.value, 'green'); assert.equal(v.tier.value, 3);
  assert.ok(v.quality.confidence < r.quality.confidence);
  assert.ok(v.quality.flags.includes('impossible_state') && v.tier.flags.includes('impossible_state'));
  assert.equal(needsReview(v), true);
  assert.deepEqual(r, slot('green', 3, 1)); // input not mutated
});

test('stars out of range, unknown quality, unreadable', () => {
  const s = validateReading('governor_profile', slot('green', 0, 3));
  assert.equal(s.stars.value, 3); assert.ok(s.stars.flags.includes('stars_out_of_range')); assert.ok(s.stars.confidence < 0.95);
  assert.ok(validateReading('governor_profile', slot('pink', 0, 0)).quality.flags.includes('quality_unknown'));
  const u = validateReading('governor_profile', slot('gold', null, 1));
  assert.ok(u.tier.flags.includes('unreadable')); assert.equal(u.tier.confidence, 0);
});

test('charm level', () => {
  const ok = { slot: 'archer_1', level: f(22) };
  assert.deepEqual(validateReading('governor_profile', ok), ok);
  const bad = validateReading('governor_profile', { slot: 'archer_1', level: f(23) });
  assert.equal(bad.level.value, 23); assert.ok(bad.level.flags.includes('level_out_of_range'));
});

test('hero gear flags', () => {
  const piece = (o = {}) => ({ troop: f('infantry'), rarity: f('gold'), level: f(100), forgery: f(20), ...o });
  assert.equal(needsReview(validateReading('hero_gear', piece())), false);
  const v = validateReading('hero_gear', piece({ troop: f('mage'), level: f(201), forgery: f(21) }));
  assert.ok(v.troop.flags.includes('troop_unknown'));
  assert.ok(v.level.flags.includes('level_out_of_range'));
  assert.ok(v.forgery.flags.includes('forgery_out_of_range'));
  assert.equal(v.forgery.value, 21);
  const mismatch = validateReading('hero_gear', piece({ rarity: f('gold'), level: f(101) }));
  assert.ok(mismatch.rarity.flags.includes('rarity_level_mismatch'));
  assert.equal(validateReading('hero_gear', piece({ troop: f(null) })).troop.confidence, 0);
});

test('needsReview thresholds', () => {
  assert.equal(needsReview(f('x', 0.79)), true);
  assert.equal(needsReview(f('x', 0.8)), false);
  assert.equal(needsReview(f('x', 0.8), 0.9), true);
  assert.equal(needsReview({}), true);
});

test('kind registry', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), ['governor_profile', 'hero_gear']);
  for (const k of Object.keys(KINDS)) {
    const e = getKind(k);
    assert.ok(e.gameData && typeof e.validate === 'function' && e.profileSchema);
  }
  assert.throws(() => getKind('nope'), /Unknown scan kind "nope"/);
  assert.throws(() => getKind('toString'), /Unknown scan kind/);
  assert.throws(() => validateReading('nope', {}), /Unknown scan kind/);
});

test('engine skeleton never fakes readings', () => {
  const pixels = { width: 20, height: 40, data: new Uint8ClampedArray(20 * 40 * 4) };
  const rect = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
  const profile = { kind: 'governor_profile', version: 3, anchor: { type: 'rect', expected: rect }, regions: {} };
  const r = runScan('governor_profile', pixels, profile);
  assert.equal(r.status, 'not_implemented');
  assert.deepEqual(r.reasons, ['readers arrive in phase 3']);
  assert.equal(r.engine_version, ENGINE_VERSION); assert.equal(ENGINE_VERSION, '0.1.0-phase1');
  assert.deepEqual(r.normalized_size, { width: 1080, height: 2160 });
  assert.equal(r.gear, undefined);
  assert.equal(runScan('governor_profile', pixels, { ...profile, anchor: undefined }).status, 'invalid_profile');
  assert.equal(runScan('hero_gear', pixels, profile).status, 'invalid_profile');
  assert.equal(runScan('governor_profile', { width: 0, height: 0, data: new Uint8Array(0) }, profile).status, 'invalid_image');
  assert.throws(() => runScan('nope', pixels, profile), /Unknown scan kind/);
});
