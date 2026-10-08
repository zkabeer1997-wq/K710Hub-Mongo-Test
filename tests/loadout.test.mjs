import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOADOUT_PIECES, LOADOUT_CHARM_TOTAL, parseGearValue, composeGearValue, editGearValue, gearAriaLabel,
  charmAriaLabel, gearAnnouncement, charmAnnouncement, loadoutCounts, completionText, reviewLines, tiersFor, starsFor,
} from '../lib/loadout.mjs';
import {
  CHARM_SLOTS, GOVERNOR_GEAR_SLOTS, blankCharmSelections, blankGovernorGearSelections,
  parseCharmSelections, parseGovernorGearSelections, serializeCharmSelections, serializeGovernorGearSelections,
} from '../lib/powerProfiles.mjs';
import { GOVERNOR_GEAR_OPTIONS, CHARM_LEVEL_OPTIONS } from '../lib/equipmentOptions.mjs';
import { GOVERNOR_GEAR_STATES } from '../lib/scan/kinds/governorProfile/gameData.mjs';

test('pieces cover the six gear slots and 18 charm slots exactly once', () => {
  assert.deepEqual(LOADOUT_PIECES.map((p) => p.id), ['hat', 'shirt', 'ring', 'pendant', 'pants', 'baton']);
  assert.deepEqual(LOADOUT_PIECES.map((p) => p.gearKey), ['cavalry_1', 'infantry_1', 'archer_1', 'cavalry_2', 'infantry_2', 'archer_2']);
  assert.deepEqual(LOADOUT_PIECES.find((p) => p.id === 'hat').charmKeys, ['cavalry_1', 'cavalry_2', 'cavalry_3']);
  assert.deepEqual(LOADOUT_PIECES.find((p) => p.id === 'baton').charmKeys, ['archer_4', 'archer_5', 'archer_6']);
  assert.deepEqual(new Set(LOADOUT_PIECES.map((p) => p.gearKey)), new Set(GOVERNOR_GEAR_SLOTS.map((s) => s.key)));
  const charmKeys = LOADOUT_PIECES.flatMap((p) => p.charmKeys);
  assert.equal(charmKeys.length, LOADOUT_CHARM_TOTAL);
  assert.deepEqual(new Set(charmKeys), new Set(CHARM_SLOTS.map((s) => s.key)));
});

test('all 58 gear states round-trip through structured parts and the stored strings', () => {
  assert.equal(GOVERNOR_GEAR_STATES.length, 58);
  for (const option of GOVERNOR_GEAR_OPTIONS) {
    const parsed = parseGearValue(option);
    assert.ok(parsed, option);
    assert.equal(composeGearValue(parsed), option);
  }
  for (const piece of LOADOUT_PIECES) {
    const gear = { ...blankGovernorGearSelections(), [piece.gearKey]: 'Gold T3 ★★' };
    const stored = serializeGovernorGearSelections(gear);
    assert.equal(parseGovernorGearSelections(stored)[piece.gearKey], 'Gold T3 ★★');
  }
});

test('charm levels 1-22 round-trip through the stored string', () => {
  for (const level of CHARM_LEVEL_OPTIONS) {
    for (const key of LOADOUT_PIECES.flatMap((p) => p.charmKeys)) {
      const charms = { ...blankCharmSelections(), [key]: level };
      assert.equal(parseCharmSelections(serializeCharmSelections(charms))[key], level);
    }
  }
  assert.equal(CHARM_LEVEL_OPTIONS.length, 22);
});

test('stored format is unchanged for a seeded profile', () => {
  const gear = 'Infantry 1: Purple T1 | Cavalry 1: Blue 3 stars | Archer 1: Purple 2 stars';
  const charms = 'Infantry Charm 1: Level 12 | Cavalry Charm 1: Level 9 | Archer Charm 1: Level 14';
  // serialize writes in the fixed slot order (infantry, archer, cavalry); the values are kept verbatim.
  assert.equal(serializeGovernorGearSelections(parseGovernorGearSelections(gear)), 'Infantry 1: Purple T1 | Archer 1: Purple 2 stars | Cavalry 1: Blue 3 stars');
  assert.equal(serializeCharmSelections(parseCharmSelections(charms)).split(' | ').length, 3);
});

test('editing parts keeps tier and stars valid', () => {
  assert.equal(editGearValue('', 'quality', 'gold'), 'Gold');
  assert.equal(editGearValue('Gold T3 ★★★', 'quality', 'purple'), 'Purple 3 stars');
  assert.equal(editGearValue('Gold T3 ★★★', 'quality', 'green'), 'Green 1 star');
  assert.equal(editGearValue('Red T6 ★★', 'tier', '2'), 'Red T2 ★★');
  assert.equal(editGearValue('Gold T1', 'stars', '2'), 'Gold T1 ★★');
  assert.equal(editGearValue('Gold T1', 'quality', ''), '');
  assert.equal(editGearValue('', 'stars', '2'), '');
  assert.deepEqual(tiersFor('purple'), [0, 1]);
  assert.deepEqual(starsFor('green', 0), [0, 1]);
  assert.equal(composeGearValue({ quality: 'blue', tier: 5, stars: 9 }), 'Blue 3 stars');
  assert.equal(composeGearValue({ quality: 'nope' }), '');
});

test('labels, announcements and counts', () => {
  const hat = LOADOUT_PIECES[0];
  assert.equal(gearAriaLabel(hat, 'Gold T3 ★★'), 'Cavalry hat: Gold T3, 2 stars');
  assert.equal(gearAriaLabel(hat, ''), 'Cavalry hat: no gear');
  assert.equal(gearAriaLabel(hat, 'Gold'), 'Cavalry hat: Gold, no stars');
  assert.equal(charmAriaLabel(hat, 1, 'Level 12'), 'Cavalry hat charm 2: Level 12');
  assert.equal(charmAriaLabel(hat, 0, ''), 'Cavalry hat charm 1: not set');
  assert.equal(gearAnnouncement(hat, 'Gold T3 ★★'), 'Hat set to Gold T3, 2 stars');
  assert.equal(gearAnnouncement(hat, 'Gold T3 ★'), 'Hat set to Gold T3, 1 star');
  assert.equal(gearAnnouncement(hat, ''), 'Hat cleared');
  assert.equal(charmAnnouncement(hat, 2, 'Level 5'), 'Hat charm 3 set to Level 5');
  const gear = { cavalry_1: 'Gold', infantry_1: 'Red', archer_1: 'Blue', archer_2: 'Green' };
  const charms = Object.fromEntries(CHARM_SLOTS.slice(0, 9).map((s) => [s.key, 'Level 1']));
  assert.deepEqual(loadoutCounts(gear, charms), { gear: 4, charms: 9 });
  assert.equal(completionText(gear, charms), 'Governor Gear: 4 of 6 slots · Charms: 9 of 18');
  assert.equal(reviewLines(gear, { cavalry_1: 'Level 7' })[0].charms, '7 / - / -');
});
