import test from 'node:test';
import assert from 'node:assert/strict';
import { GOVERNOR_GEAR_OPTIONS } from '../lib/equipmentOptions.mjs';
import { GOVERNOR_GEAR_LEVELS } from '../lib/phase2Data.mjs';
import { serializeCharmSelections, serializeGovernorGearSelections } from '../lib/powerProfiles.mjs';
import {
  applyProfileCharms,
  applyProfileGearToRows,
  parseCharmLevel,
  plannerTiersFromProfile,
  profileCharmsDiffer,
  profileGearDiffers,
  profileGearToPlannerTier,
  profileHasCharms,
  profileHasGear,
  profileIsNewer,
} from '../lib/profileToTools.mjs';

test('every Purple, Gold and Red profile option maps to a distinct planner tier, in order (Green / Blue stars are left unmapped)', () => {
  const mapped = GOVERNOR_GEAR_OPTIONS.filter((o) => !/^(Green|Blue)\b.* (star|stars)$/.test(o)).map(profileGearToPlannerTier);
  assert.ok(mapped.every(Boolean), 'all options map');
  assert.equal(new Set(mapped).size, mapped.length, 'no two options share a tier');
  const indexes = mapped.map((tier) => GOVERNOR_GEAR_LEVELS.findIndex((level) => level.tier === tier));
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
});

test('gear option examples', () => {
  assert.equal(profileGearToPlannerTier('Gold T3 ★★'), 'Gold T3 +2');
  assert.equal(profileGearToPlannerTier('Red T0'), 'Red');
  assert.equal(profileGearToPlannerTier('Red'), 'Red');
  assert.equal(profileGearToPlannerTier('Purple 3 stars'), 'Purple +3');
  assert.equal(profileGearToPlannerTier('Purple T1 ★'), 'Purple T1 +1');
  // star counts of Green / Blue are not mapped (the numeral meaning is not in any data file)
  assert.equal(profileGearToPlannerTier('Blue 2 stars'), '');
  assert.equal(profileGearToPlannerTier('Green 1 star'), '');
  assert.equal(profileGearToPlannerTier('Blue'), 'Blue');
  assert.equal(profileGearToPlannerTier(''), '');
  assert.equal(profileGearToPlannerTier('Mythic'), '');
  assert.equal(profileGearToPlannerTier('Red T9'), '');
});

const gearString = serializeGovernorGearSelections({
  cavalry_1: 'Gold T3 ★★', cavalry_2: 'Red T0', infantry_1: 'Purple', infantry_2: '', archer_1: 'Blue 1 star', archer_2: 'Gold',
});

test('profile gear maps hat/pendant/shirt/pants/ring/baton onto planner rows', () => {
  assert.deepEqual(plannerTiersFromProfile(gearString), ['Gold T3 +2', 'Red', 'Purple', '', '', 'Gold']);
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, tier: 'Green', targetTier: 'Red' }));
  const next = applyProfileGearToRows(rows, gearString);
  assert.deepEqual(next.map((row) => row.tier), ['Gold T3 +2', 'Red', 'Purple', 'Green', 'Green', 'Gold']);
  assert.ok(next.every((row) => row.targetTier === 'Red'));
  assert.equal(profileHasGear(gearString), true);
  assert.equal(profileHasGear(''), false);
  assert.equal(profileGearDiffers(next, gearString), false);
  assert.equal(profileGearDiffers(rows, gearString), true);
});

const charms = ['infantry', 'cavalry', 'archer'].flatMap((type) =>
  Array.from({ length: 6 }, (_, index) => ({ id: `${type}-${index + 1}`, type: type[0].toUpperCase() + type.slice(1), number: index + 1, current: 0, target: 10 })));

test('profile charms fill planner charms and keep targets at or above the level', () => {
  const profile = serializeCharmSelections({ cavalry_1: 'Level 12', infantry_6: 'Level 3', archer_2: 'Level 22', archer_3: 'Level 0' });
  const next = applyProfileCharms(charms, profile);
  const find = (id) => next.find((charm) => charm.id === id);
  assert.deepEqual([find('cavalry-1').current, find('cavalry-1').target], [12, 12]);
  assert.deepEqual([find('infantry-6').current, find('infantry-6').target], [3, 10]);
  assert.equal(find('archer-2').current, 22);
  assert.equal(find('archer-3').current, 0, 'out-of-range level ignored');
  assert.equal(find('infantry-1').current, 0, 'unset charms untouched');
  assert.equal(profileHasCharms(profile), true);
  assert.equal(profileHasCharms(''), false);
  assert.equal(profileCharmsDiffer(charms, profile), true);
  assert.equal(profileCharmsDiffer(next, profile), false);
  assert.equal(parseCharmLevel('Level 12'), 12);
  assert.equal(parseCharmLevel('Level 23'), null);
});

test('profile newer than the tool state only when both dates are valid', () => {
  assert.equal(profileIsNewer('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'), true);
  assert.equal(profileIsNewer('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'), false);
  assert.equal(profileIsNewer('2026-10-01T00:00:00Z', null), false);
  assert.equal(profileIsNewer(undefined, '2026-10-01T00:00:00Z'), false);
});
