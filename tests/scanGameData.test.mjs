import assert from 'node:assert/strict';
import test from 'node:test';
import { GOVERNOR_GEAR_OPTIONS } from '../lib/equipmentOptions.mjs';
import {
  QUALITIES, GOVERNOR_GEAR_STATES, isValidGearState, maxStars, labelFor, GEAR_SLOTS, GEAR_SLOT_FORM_KEYS,
  CHARM_LEVELS, CHARM_SLOTS, QUALITY_PALETTE, QUALITY_PALETTE_STATUS, isValidCharmLevel,
} from '../lib/scan/kinds/governorProfile/gameData.mjs';
import {
  TROOP_ICONS, rarityForLevel, isValidHeroGearLevel, isValidForgery, troopForIcon,
} from '../lib/scan/kinds/heroGear/gameData.mjs';

test('58 governor gear states', () => {
  assert.equal(GOVERNOR_GEAR_STATES.length, 58);
  assert.equal(new Set(GOVERNOR_GEAR_STATES.map((s) => s.label)).size, 58);
});

test('labels match GOVERNOR_GEAR_OPTIONS 1:1 and in order', () => {
  assert.deepEqual(GOVERNOR_GEAR_STATES.map((s) => s.label), GOVERNOR_GEAR_OPTIONS);
  for (const o of GOVERNOR_GEAR_OPTIONS) assert.ok(GOVERNOR_GEAR_STATES.some((s) => labelFor(s) === o), o);
});

test('state validity and star limits', () => {
  assert.equal(maxStars('green', 0), 1);
  assert.equal(maxStars('red', 6), 3);
  assert.equal(maxStars('red', 7), null);
  assert.equal(maxStars('gold', 4), null);
  assert.equal(maxStars('purple', 2), null);
  assert.equal(maxStars('blue', 1), null);
  assert.equal(isValidGearState('green', 0, 2), false);
  assert.equal(isValidGearState('gold', 3, 3), true);
  assert.equal(isValidGearState('gold', 3, 4), false);
  assert.equal(isValidGearState('gold', 3, 1.5), false);
  assert.equal(isValidGearState('pink', 0, 0), false);
  assert.equal(QUALITIES.length, 5);
});

test('slots and charms', () => {
  assert.deepEqual([...GEAR_SLOTS].sort(), ['baton', 'hat', 'pants', 'pendant', 'ring', 'shirt']);
  assert.equal(GEAR_SLOT_FORM_KEYS.hat, 'cavalry_1');
  assert.equal(CHARM_SLOTS.length, 18);
  assert.equal(new Set(CHARM_SLOTS).size, 18);
  assert.ok(CHARM_SLOTS.includes('infantry_1') && CHARM_SLOTS.includes('archer_6') && CHARM_SLOTS.includes('cavalry_4'));
  assert.equal(CHARM_LEVELS.length, 22);
  assert.equal(isValidCharmLevel(22), true); assert.equal(isValidCharmLevel(23), false); assert.equal(isValidCharmLevel(0), false);
});

test('quality palette lives in gearTemplates.json, not in a hand-typed list', () => {
  assert.equal(QUALITY_PALETTE_STATUS, 'in-gearTemplates.json');
  assert.deepEqual(QUALITY_PALETTE, []);
});

test('hero gear rules', () => {
  assert.deepEqual(TROOP_ICONS, { shield: 'infantry', horse: 'cavalry', crossbow: 'archer' });
  assert.equal(troopForIcon('horse'), 'cavalry'); assert.equal(troopForIcon('x'), null);
  assert.equal(rarityForLevel(1), 'gold'); assert.equal(rarityForLevel(100), 'gold');
  assert.equal(rarityForLevel(101), 'red'); assert.equal(rarityForLevel(200), 'red');
  assert.equal(rarityForLevel(0), 'unknown'); assert.equal(rarityForLevel(201), 'unknown'); assert.equal(rarityForLevel(1.5), 'unknown');
  assert.equal(isValidHeroGearLevel(200), true); assert.equal(isValidHeroGearLevel(201), false);
  assert.equal(isValidForgery(0), true); assert.equal(isValidForgery(20), true);
  assert.equal(isValidForgery(21), false); assert.equal(isValidForgery(-1), false);
});
