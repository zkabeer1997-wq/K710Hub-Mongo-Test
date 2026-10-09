import assert from 'node:assert/strict';
import {
  DEFAULT_TROOP_WEIGHTS,
  MAX_LEAD_HEROES,
  assignLeadHeroesForRally,
  assignMemberToRally,
  autoAssignRallyMembers,
  createNextRally,
  decrementRallyLeadHero,
  formatRallyRows,
  hydrateRallies,
  getLeadHeroTotal,
  getMatchingLeadHeroes,
  getRallyLeadMemberIds,
  getTroopLevelSummary,
  incrementRallyLeadHero,
  normalizeRalliesForRows,
  parseStoredRallies,
  removeMemberFromRallies,
  removeRallyById,
  removeRowsAndAssignments,
  renameRally,
  serializeRalliesForSave,
  setRallyLead,
  setRallyTroopWeight,
} from '../app/admin/dashboard/rallyState.mjs';

function rally(id, overrides = {}) {
  return {
    id,
    name: id,
    memberIds: [],
    leadMemberId: '',
    managerName: '',
    rallyType: 'attack',
    formationKind: 'balanced',
    notes: '',
    troopWeights: { ...DEFAULT_TROOP_WEIGHTS },
    leadHeroes: {},
    leadHeroAssignments: {},
    ...overrides,
  };
}

function member(id, overrides = {}) {
  return {
    member_id: id,
    name: id,
    heroes: [],
    availability: 'Full battle (12-17 UTC)',
    infantry_tier: '', infantry_tg: '',
    cavalry_tier: '', cavalry_tg: '',
    archer_tier: '', archer_tg: '',
    ...overrides,
  };
}

// --- createNextRally -------------------------------------------------------

const created = createNextRally([], 'rally-1');
assert.equal(created.length, 1);
assert.deepEqual(created[0], {
  id: 'rally-1',
  name: 'Rally 1',
  managerName: '',
  rallyType: 'attack',
  formationKind: 'balanced',
  notes: '',
  memberIds: [],
  leadMemberId: '',
  troopWeights: { infantry: 0, cavalry: 0, archer: 0 },
  leadHeroes: {},
  leadHeroAssignments: {},
});
assert.equal(createNextRally(created, 'rally-2')[1].name, 'Rally 2', 'names follow list length');

// --- renameRally -----------------------------------------------------------

const renamed = renameRally([rally('a'), rally('b')], 'a', 'Bear Squad');
assert.equal(renamed[0].name, 'Bear Squad');
assert.equal(renamed[1].name, 'b', 'other rallies untouched');

// --- assignMemberToRally ---------------------------------------------------

// A member belongs to exactly one rally: assigning moves rather than copies.
const twoRallies = [rally('a', { memberIds: ['101'] }), rally('b')];
const moved = assignMemberToRally(twoRallies, 'b', '101');
assert.deepEqual(moved[0].memberIds, [], 'removed from previous rally');
assert.deepEqual(moved[1].memberIds, ['101'], 'added to target rally');

const reassigned = assignMemberToRally(moved, 'b', '101');
assert.deepEqual(reassigned[1].memberIds, ['101'], 'assigning twice does not duplicate');

assert.deepEqual(
  assignMemberToRally([rally('a')], 'a', 202)[0].memberIds,
  ['202'],
  'numeric ids are coerced to strings',
);

// A Rally Lead (of this rally or any other) cannot be assigned as a joiner.
const leadGuardRallies = [rally('a', { leadMemberId: '303' }), rally('b')];
assert.deepEqual(
  assignMemberToRally(leadGuardRallies, 'b', '303'),
  leadGuardRallies,
  'assigning a rally lead as a joiner of another rally is a no-op',
);
assert.deepEqual(
  assignMemberToRally(leadGuardRallies, 'a', '303'),
  leadGuardRallies,
  'assigning a rally lead as a joiner of their own rally is a no-op',
);
assert.deepEqual(
  getRallyLeadMemberIds([rally('a', { leadMemberId: '303' }), rally('b', { leadMemberId: '' })]),
  new Set(['303']),
);

// --- removeMemberFromRallies / removeRallyById ------------------------------

const populated = [rally('a', { memberIds: ['101', '202'] }), rally('b', { memberIds: ['101'] })];
const pruned = removeMemberFromRallies(populated, '101');
assert.deepEqual(pruned[0].memberIds, ['202']);
assert.deepEqual(pruned[1].memberIds, []);

assert.deepEqual(removeRallyById(populated, 'a').map((r) => r.id), ['b']);

// --- setRallyLead ----------------------------------------------------------

assert.equal(setRallyLead([rally('a')], 'a', '303')[0].leadMemberId, '303');
assert.equal(setRallyLead([rally('a')], 'a', null)[0].leadMemberId, '', 'clearing yields empty string');

// Promoting a member to Rally Lead removes them from every rally's joiner list.
const promoted = setRallyLead(
  [rally('a', { memberIds: ['303', '404'] }), rally('b', { memberIds: ['303'] })],
  'a',
  '303',
);
assert.equal(promoted[0].leadMemberId, '303');
assert.deepEqual(promoted[0].memberIds, ['404'], 'the new lead is dropped as a joiner in their own rally');
assert.deepEqual(promoted[1].memberIds, [], 'the new lead is dropped as a joiner in every other rally too');

// --- setRallyTroopWeight ---------------------------------------------------

assert.deepEqual(
  setRallyTroopWeight([rally('a')], 'a', 'infantry', 60)[0].troopWeights,
  { infantry: 60, cavalry: 0, archer: 0 },
);
assert.equal(
  setRallyTroopWeight([rally('a')], 'a', 'infantry', 150)[0].troopWeights.infantry,
  100,
  'weights clamp to 100',
);
assert.equal(
  setRallyTroopWeight([rally('a')], 'a', 'cavalry', -20)[0].troopWeights.cavalry,
  0,
  'weights clamp to 0',
);
assert.equal(
  setRallyTroopWeight([rally('a')], 'a', 'archer', 'nonsense')[0].troopWeights.archer,
  0,
  'non-numeric input falls back to 0',
);

// --- incrementRallyLeadHero / decrementRallyLeadHero ------------------------

// The same hero can be selected more than once (e.g. 3x Saul), up to a
// combined total of MAX_LEAD_HEROES across every hero.
let withHeroes = [rally('a')];
withHeroes = incrementRallyLeadHero(withHeroes, 'a', 'Saul');
withHeroes = incrementRallyLeadHero(withHeroes, 'a', 'Saul');
withHeroes = incrementRallyLeadHero(withHeroes, 'a', 'Saul');
withHeroes = incrementRallyLeadHero(withHeroes, 'a', 'Thrud');
assert.deepEqual(withHeroes[0].leadHeroes, { Saul: 3, Thrud: 1 });
assert.equal(getLeadHeroTotal(withHeroes[0]), MAX_LEAD_HEROES);

// The cap applies to the combined total, not per hero.
const overCap = incrementRallyLeadHero(withHeroes, 'a', 'Saul');
assert.deepEqual(overCap[0].leadHeroes, { Saul: 3, Thrud: 1 }, 'a hero beyond the combined cap is refused');

const decremented = decrementRallyLeadHero(withHeroes, 'a', 'Saul');
assert.deepEqual(decremented[0].leadHeroes, { Saul: 2, Thrud: 1 });
assert.equal(getLeadHeroTotal(decremented[0]), 3, 'a freed slot lowers the total');

const droppedToZero = decrementRallyLeadHero(
  decrementRallyLeadHero(decrementRallyLeadHero(withHeroes, 'a', 'Thrud'), 'nope', 'Thrud'),
  'a',
  'Missing',
);
assert.deepEqual(droppedToZero[0].leadHeroes, { Saul: 3 }, 'a hero count reaching zero is removed entirely');

// --- getMatchingLeadHeroes -------------------------------------------------

assert.deepEqual(
  getMatchingLeadHeroes({ heroes: ['Chenko', 'Zoe'] }, { leadHeroes: { Chenko: 1, Amane: 1 } }),
  ['Chenko'],
);
assert.deepEqual(getMatchingLeadHeroes({}, { leadHeroes: { Chenko: 1 } }), [], 'member with no heroes');
assert.deepEqual(getMatchingLeadHeroes({ heroes: ['Chenko'] }, {}), [], 'rally with no lead heroes');

// --- getTroopLevelSummary --------------------------------------------------

assert.deepEqual(
  getTroopLevelSummary({
    infantry_tier: 'T11', infantry_tg: 'TG8',
    cavalry_tier: 'T10', cavalry_tg: 'TG7',
    archer_tier: 'T8', archer_tg: 'TG4',
  }),
  ['Inf T11/TG8', 'Cav T10/TG7', 'Arch T8/TG4'],
);
assert.deepEqual(
  getTroopLevelSummary({ infantry_tier: 'T11' }),
  ['Inf T11'],
  'troop types with no data are omitted entirely',
);

// --- assignLeadHeroesForRally -----------------------------------------------

const heroRally = rally('a', { leadHeroes: { Saul: 2, Thrud: 1 } });
const heroMembers = [
  member('has-saul-1', { heroes: ['Saul'] }),
  member('has-saul-2', { heroes: ['Saul'] }),
  member('no-heroes', {}),
];
const heroAssign = assignLeadHeroesForRally(heroRally, heroMembers);
assert.deepEqual(heroAssign.assignments, { 'has-saul-1': 'Saul', 'has-saul-2': 'Saul' });
assert.ok(heroAssign.lines.some((line) => line.includes('has-saul-1') && line.includes('Saul')));
assert.ok(heroAssign.lines.some((line) => line.includes('Thrud: 0/1')), 'shortfall is reported when a hero has no eligible members');

// A member is only ever assigned one lead hero, even if they'd match two.
const dualMatch = rally('a', { leadHeroes: { Saul: 1, Thrud: 1 } });
const dualMembers = [member('dual', { heroes: ['Saul', 'Thrud'] })];
const dualAssign = assignLeadHeroesForRally(dualMatch, dualMembers);
assert.equal(Object.keys(dualAssign.assignments).length, 1, 'one member covers only one hero slot');

// --- autoAssignRallyMembers: troop-level ordering ---------------------------
// TG8+T11 > TG8+T10 > TG7+T11 > TG6+T11 > TG7+T10 > TG5+T11 > TG6+T10 > TG5+T10

const orderedRoster = [
  member('tg8-t10', { infantry_tier: 'T10', infantry_tg: 'TG8' }),
  member('tg8-t11', { infantry_tier: 'T11', infantry_tg: 'TG8' }),
  member('tg5-t10', { infantry_tier: 'T10', infantry_tg: 'TG5' }),
  member('tg7-t11', { infantry_tier: 'T11', infantry_tg: 'TG7' }),
];
const infantryOnly = [rally('a', { troopWeights: { infantry: 100, cavalry: 0, archer: 0 } })];
const orderedResult = autoAssignRallyMembers(infantryOnly, 'a', orderedRoster);
assert.deepEqual(
  orderedResult.rallies[0].memberIds,
  ['tg8-t11', 'tg8-t10', 'tg7-t11', 'tg5-t10'],
  'members are ranked by the explicit troop-level order, best first',
);

// --- autoAssignRallyMembers: cavalry-heavy vs archer-heavy formations -------

const formationRoster = [
  member('cav-specialist', {
    infantry_tier: 'T11', infantry_tg: 'TG8',
    cavalry_tier: 'T11', cavalry_tg: 'TG8',
    archer_tier: 'T10', archer_tg: 'TG5',
  }),
  member('arch-specialist', {
    infantry_tier: 'T11', infantry_tg: 'TG8',
    cavalry_tier: 'T11', cavalry_tg: 'TG7',
    archer_tier: 'T11', archer_tg: 'TG8',
  }),
];

// 60/40/0: cavalry > archer, so only infantry+cavalry are weighed.
const cavHeavy = [rally('a', { troopWeights: { infantry: 60, cavalry: 40, archer: 0 } })];
const cavHeavyResult = autoAssignRallyMembers(cavHeavy, 'a', formationRoster);
assert.equal(cavHeavyResult.rallies[0].memberIds[0], 'cav-specialist', 'cavalry-heavy formation favors the cavalry specialist');

// 50/1/49: archer >= cavalry, so infantry+archer+cavalry are all weighed.
const archHeavy = [rally('a', { troopWeights: { infantry: 50, cavalry: 1, archer: 49 } })];
const archHeavyResult = autoAssignRallyMembers(archHeavy, 'a', formationRoster);
assert.equal(archHeavyResult.rallies[0].memberIds[0], 'arch-specialist', 'archer-heavy formation favors the archer specialist');

// --- autoAssignRallyMembers: 8-target with first/second-half backfill ------

function fullBattle(id) { return member(id, { availability: 'Full battle (12-17 UTC)' }); }
function firstHalf(id) { return member(id, { availability: 'First half (12-14:30 UTC)' }); }
function secondHalf(id) { return member(id, { availability: 'Second half (14:30-17 UTC)' }); }
function notAvailable(id) { return member(id, { availability: 'Not Available' }); }

// Exactly 8 full-battle members: fills the rally with no backfill needed.
const eightFull = Array.from({ length: 8 }, (_, i) => fullBattle(`full-${i}`));
const eightResult = autoAssignRallyMembers([rally('a')], 'a', eightFull);
assert.equal(eightResult.rallies[0].memberIds.length, 8);
assert.equal(eightResult.summary.fullCount, 8);
assert.equal(eightResult.summary.addedCount, 8);

// 6 full-battle + a deep bench of first/second half: 2 remaining slots pull
// 2 first-half + 2 second-half members (10 total), not 2.
const sixFullRoster = [
  ...Array.from({ length: 6 }, (_, i) => fullBattle(`full-${i}`)),
  ...Array.from({ length: 4 }, (_, i) => firstHalf(`first-${i}`)),
  ...Array.from({ length: 4 }, (_, i) => secondHalf(`second-${i}`)),
  notAvailable('benched'),
];
const backfillResult = autoAssignRallyMembers([rally('a')], 'a', sixFullRoster);
const backfillIds = backfillResult.rallies[0].memberIds;
assert.equal(backfillIds.length, 10, '6 full-time + 2 remaining slots -> 2 first + 2 second half');
assert.equal(backfillResult.summary.fullCount, 6);
assert.equal(backfillResult.summary.firstHalfCount, 2);
assert.equal(backfillResult.summary.secondHalfCount, 2);
assert.ok(!backfillIds.includes('benched'), 'members marked not available are skipped despite the best stats');

// More than 8 full-battle members: only the best 8 are picked, no backfill.
const twelveFull = Array.from({ length: 12 }, (_, i) => fullBattle(`full-${i}`));
const overflowResult = autoAssignRallyMembers([rally('a')], 'a', twelveFull);
assert.equal(overflowResult.rallies[0].memberIds.length, 8);
assert.equal(overflowResult.summary.firstHalfCount, 0);
assert.equal(overflowResult.summary.secondHalfCount, 0);

// Members already committed to another rally are not poached.
const contested = [rally('a'), rally('b', { memberIds: ['full-0'] })];
const contestedResult = autoAssignRallyMembers(contested, 'a', eightFull);
assert.ok(!contestedResult.rallies[0].memberIds.includes('full-0'), 'members assigned elsewhere are excluded');

// A member who is a Rally Lead anywhere is never auto-assigned as a joiner.
const leadGuardAuto = [rally('a'), rally('b', { leadMemberId: 'full-0' })];
const leadGuardResult = autoAssignRallyMembers(leadGuardAuto, 'a', eightFull);
assert.ok(!leadGuardResult.rallies[0].memberIds.includes('full-0'), 'rally leads are excluded from auto assign');

assert.deepEqual(
  autoAssignRallyMembers([rally('a')], 'missing', eightFull),
  { rallies: [rally('a')], summary: null },
  'unknown rally id is a no-op',
);

// Auto assign also runs lead-hero assignment across the final roster.
const heroCarrier = { ...fullBattle('saul-carrier'), heroes: ['Saul'] };
const heroAutoRoster = [
  ...Array.from({ length: 7 }, (_, i) => fullBattle(`full-${i}`)),
  heroCarrier,
];
const heroAutoRally = [rally('a', { leadHeroes: { Saul: 1 } })];
const heroAutoResult = autoAssignRallyMembers(heroAutoRally, 'a', heroAutoRoster);
assert.equal(heroAutoResult.rallies[0].leadHeroAssignments['saul-carrier'], 'Saul');
assert.ok(heroAutoResult.summary.leadHeroLines.some((line) => line.includes('saul-carrier') && line.includes('Saul')));

// --- normalizeRalliesForRows / removeRowsAndAssignments ---------------------

assert.deepEqual(
  normalizeRalliesForRows([rally('a', { memberIds: ['101', 'ghost'] })], [{ member_id: '101' }])[0].memberIds,
  ['101'],
  'members with no matching roster row are dropped',
);

const removal = removeRowsAndAssignments(
  [{ member_id: '101' }, { member_id: '202' }],
  [rally('a', { memberIds: ['101', '202'] })],
  ['101'],
);
assert.deepEqual(removal.rows.map((r) => r.member_id), ['202']);
assert.deepEqual(removal.rallies[0].memberIds, ['202']);

// --- parseStoredRallies ----------------------------------------------------

assert.deepEqual(parseStoredRallies(''), [], 'empty input');
assert.deepEqual(parseStoredRallies('not json'), [], 'malformed JSON does not throw');
assert.deepEqual(parseStoredRallies('{"a":1}'), [], 'non-array payload');
assert.deepEqual(parseStoredRallies('[{"id":"a"}]'), [], 'entries missing a name are dropped');

// Legacy stored state (leadHeroes as a plain array, from before hero counts)
// still loads, with each hero converted to a count of 1.
const stored = parseStoredRallies(JSON.stringify([
  { id: 'a', name: 'Rally 1', memberIds: [101], leadHeroes: ['H1', 'H2', 'H3', 'H4', 'H5'] },
]));
assert.deepEqual(stored[0].memberIds, ['101'], 'ids normalised to strings');
assert.equal(
  Object.values(stored[0].leadHeroes).reduce((sum, n) => sum + n, 0),
  MAX_LEAD_HEROES,
  'persisted state cannot smuggle in more lead heroes than the cap',
);
assert.deepEqual(stored[0].troopWeights, DEFAULT_TROOP_WEIGHTS, 'missing weights get defaults');

// A stored count above the cap is trimmed, not rejected outright.
const overCapStored = parseStoredRallies(JSON.stringify([
  { id: 'a', name: 'Rally 1', memberIds: [], leadHeroes: { Saul: 6 } },
]));
assert.equal(overCapStored[0].leadHeroes.Saul, MAX_LEAD_HEROES);

// Legacy data saved before the lead/joiner rule existed can list the lead
// as a joiner too - normalization self-heals that on every load.
const staleLeadOverlap = parseStoredRallies(JSON.stringify([
  { id: 'a', name: 'Rally 1', memberIds: ['303', '404'], leadMemberId: '303' },
]));
assert.deepEqual(
  staleLeadOverlap[0].memberIds,
  ['404'],
  'a rally lead is stripped from their own rally\'s joiner list even in stale/legacy saved data',
);

// --- serializeRalliesForSave / formatRallyRows round trip -------------------

const inMemory = [
  rally('a', {
    name: 'Bear Squad',
    memberIds: ['202', '303'],
    leadMemberId: '101',
    troopWeights: { infantry: 70, cavalry: 20, archer: 10 },
    leadHeroes: { Saul: 2, Thrud: 1 },
    leadHeroAssignments: { 202: 'Saul' },
  }),
];

const saved = serializeRalliesForSave(inMemory);
assert.deepEqual(saved, [{
  id: 'a',
  name: 'Bear Squad',
  position: 0,
  member_ids: ['202', '303', '101'],
  lead_member_id: '101',
  manager_name: '',
  rally_type: 'attack',
  formation_kind: 'balanced',
  notes: '',
  // The DB stores weights, lead-hero counts, and hero assignments together
  // in one `formation` column.
  formation: {
    infantry: 70, cavalry: 20, archer: 10,
    leadHeroes: { Saul: 2, Thrud: 1 },
    leadHeroAssignments: { 202: 'Saul' },
  },
}]);

assert.deepEqual(
  formatRallyRows(saved),
  [rally('a', {
    name: 'Bear Squad',
    memberIds: ['202', '303'],
    leadMemberId: '101',
    troopWeights: { infantry: 70, cavalry: 20, archer: 10 },
    leadHeroes: { Saul: 2, Thrud: 1 },
    leadHeroAssignments: { 202: 'Saul' },
  })],
  'save/load round trips losslessly',
);

assert.equal(
  serializeRalliesForSave([rally('a', { name: 123 })])[0].name,
  'Rally 1',
  'non-string names fall back to a positional default',
);
assert.equal(
  serializeRalliesForSave([rally('a', { leadMemberId: '' })])[0].lead_member_id,
  null,
  'empty lead is stored as null',
);
assert.deepEqual(serializeRalliesForSave('nonsense'), [], 'non-array input');
assert.deepEqual(formatRallyRows(undefined), [], 'non-array rows');
assert.deepEqual(
  formatRallyRows([{ id: 'a', name: 'A' }])[0].troopWeights,
  DEFAULT_TROOP_WEIGHTS,
  'rows with no formation column get default weights',
);

console.log('rallyState tests passed');

// --- API round trip: GET returns camelCase; hydrating must not drop members ---
{
  const apiPayload = formatRallyRows([
    { id: 'r1', name: 'R1', position: 0, member_ids: ['1', '2', '9'], lead_member_id: '9', formation: {} },
  ]);
  const hydrated = hydrateRallies(apiPayload);
  assert.deepEqual(hydrated[0].memberIds, ['1', '2'], 'hydrate keeps members, lead stripped from joiners');
  assert.equal(hydrated[0].leadMemberId, '9');
  assert.deepEqual(serializeRalliesForSave(hydrated)[0].member_ids, ['1', '2', '9'], 'lead preserved in stored set');
  assert.deepEqual(formatRallyRows(serializeRalliesForSave(hydrated)), hydrated, 'stable round trip');
  assert.deepEqual(formatRallyRows(apiPayload)[0].memberIds, [], 'double format loses members (why the client must not do it)');
}

// --- rally card fields, ordering and the new auto-fill rules ------------------

import {
  RALLY_JOINER_FLAG_ABOVE, effectiveFormation, moveRallyJoiner, planAutoFillAll,
  rallySlotCount, setRallyField, sortRalliesByType,
} from '../app/admin/dashboard/rallyState.mjs';

const typed = createNextRally(createNextRally(createNextRally([], 'a', 'optional'), 'b', 'garrison'), 'c', 'attack');
assert.deepEqual(sortRalliesByType(typed).map((r) => r.id), ['c', 'b', 'a'], 'Attack, Garrison, Optional');
assert.equal(createNextRally([], 'x', 'nonsense')[0].rallyType, 'attack', 'unknown type falls back to attack');

assert.equal(setRallyField([rally('a')], 'a', 'managerName', 'Danko')[0].managerName, 'Danko');
assert.equal(setRallyField([rally('a')], 'a', 'rallyType', 'bogus')[0].rallyType, 'attack');
assert.equal(setRallyField([rally('a')], 'a', 'notes', 'Reinforce & Pass Castle')[0].notes, 'Reinforce & Pass Castle');
assert.deepEqual(setRallyField([rally('a')], 'a', 'unknownField', 'x'), [rally('a')], 'unknown fields ignored');

assert.deepEqual(
  moveRallyJoiner([rally('a', { memberIds: ['1', '2', '3'] })], 'a', '3', 0)[0].memberIds,
  ['3', '1', '2'], 'joiner moved to the top',
);
assert.equal(rallySlotCount(rally('a')), 10);
assert.equal(rallySlotCount(rally('a', { memberIds: Array.from({ length: 14 }, (_, i) => String(i)) })), 14, 'slots are not capped at 10');
assert.equal(RALLY_JOINER_FLAG_ABOVE, 10);

// Archer-heavy = cavalry is the lowest share: weigh infantry + archer only.
assert.equal(effectiveFormation(rally('a', { formationKind: 'archer' })), 'archer');
assert.equal(effectiveFormation(rally('a', { troopWeights: { infantry: 50, cavalry: 1, archer: 49 } })), 'archer');
assert.equal(effectiveFormation(rally('a', { troopWeights: { infantry: 60, cavalry: 40, archer: 0 } })), 'cavalry');
assert.equal(effectiveFormation(rally('a')), 'balanced');

const lowCavStrongArch = member('arch-only', {
  infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG5', archer_tier: 'T11', archer_tg: 'TG8',
});
const allRounder = member('all-round', {
  infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T11', cavalry_tg: 'TG8', archer_tier: 'T10', archer_tg: 'TG5',
});
assert.equal(
  autoAssignRallyMembers([rally('a', { formationKind: 'archer' })], 'a', [allRounder, lowCavStrongArch]).rallies[0].memberIds[0],
  'arch-only', 'archer-heavy ignores cavalry level',
);
assert.equal(
  autoAssignRallyMembers([rally('a', { formationKind: 'cavalry' })], 'a', [lowCavStrongArch, allRounder]).rallies[0].memberIds[0],
  'all-round', 'cavalry-heavy ignores archer level',
);

// 3 full battle + 5 first half => 5 second half are needed so 8 joiners are present all battle.
const split = [
  ...Array.from({ length: 3 }, (_, i) => fullBattle(`f${i}`)),
  ...Array.from({ length: 6 }, (_, i) => firstHalf(`h1-${i}`)),
  ...Array.from({ length: 6 }, (_, i) => secondHalf(`h2-${i}`)),
];
const splitResult = autoAssignRallyMembers([rally('a')], 'a', split);
assert.equal(splitResult.summary.fullCount, 3);
assert.equal(splitResult.summary.firstHalfCount, 5);
assert.equal(splitResult.summary.secondHalfCount, 5);
assert.equal(splitResult.summary.totalMembers, 13, 'total joiners may exceed 8');
assert.equal(splitResult.summary.complete, true);

// Not enough second-half joiners: the rally is reported incomplete rather than silently padded.
const thin = [fullBattle('x'), firstHalf('y')];
assert.equal(autoAssignRallyMembers([rally('a')], 'a', thin).summary.complete, false);

// Hero requirement: among equally strong joiners the hero holder is picked; a missing hero is skipped.
const heroPool = Array.from({ length: 9 }, (_, i) => fullBattle(`p${i}`));
heroPool[8] = { ...heroPool[8], heroes: ['Saul'] };
const heroPlan = autoAssignRallyMembers([rally('a', { leadHeroes: { Saul: 1, Zoya: 1 } })], 'a', heroPool);
assert.ok(heroPlan.rallies[0].memberIds.includes('p8'), 'Saul holder picked');
assert.equal(heroPlan.summary.totalMembers, 8, 'a hero nobody has does not shrink the rally');

// Auto-fill all: Attack/Garrison first, Optional only when those are complete.
const pool20 = Array.from({ length: 20 }, (_, i) => fullBattle(`m${i}`));
const plan = planAutoFillAll([
  rally('opt', { rallyType: 'optional' }), rally('att', { rallyType: 'attack' }), rally('gar', { rallyType: 'garrison' }),
], pool20);
const byId = Object.fromEntries(plan.rallies.map((r) => [r.id, r.memberIds.length]));
assert.deepEqual(byId, { opt: 4, att: 8, gar: 8 });
assert.equal(plan.preview.placed, 20);
assert.equal(plan.preview.unassigned, 0);
assert.equal(plan.preview.perRally.find((r) => r.id === 'opt').complete, false);
const pool10 = pool20.slice(0, 10);
const planShort = planAutoFillAll([rally('opt', { rallyType: 'optional' }), rally('att'), rally('gar', { rallyType: 'garrison' })], pool10);
assert.equal(planShort.rallies.find((r) => r.id === 'opt').memberIds.length, 0, 'optional untouched while a main rally is short');
assert.equal(planShort.preview.perRally.find((r) => r.id === 'opt').skipped, true);

// Re-running keeps joiners by default and clears them with replace.
const kept = planAutoFillAll(plan.rallies, [...pool20, ...Array.from({ length: 4 }, (_, i) => fullBattle(`n${i}`))]);
assert.equal(kept.preview.keptCount, 20);
assert.equal(kept.rallies.find((r) => r.id === 'att').memberIds.length, 8, 'complete rallies are left alone');
const replaced = planAutoFillAll(plan.rallies, pool20, { replace: true });
assert.equal(replaced.preview.replacedCount, 20);
assert.equal(replaced.preview.placed, 20);
