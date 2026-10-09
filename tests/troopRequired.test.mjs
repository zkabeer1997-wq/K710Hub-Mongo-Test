import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

// Troop tier + TG are required on the KvK Availability and Flamedragon Tyrant forms, and what the
// member enters is remembered on their profile (power_profiles) without touching Power Profile fields.

const state = { tables: {} };
globalThis.__troopReqTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:tr-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:tr-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:tr-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:tr-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__troopReqTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'troop-required-test-only';
const availRoute = await import('../app/api/kvk-availability/route.js');
const dragonRoute = await import('../app/api/flamedragon/route.js');
const profileRoute = await import('../app/api/power-profile/route.js');
const memberProfileRoute = await import('../app/api/member-power-profile/route.js');
const statusRoute = await import('../app/api/member-form-status/route.js');
const { getMemberFormCompletions } = await import('../lib/formCompletionQueries.server.js');
const { COLLECTIONS: T } = await import('../lib/mongoCollections.js');
const kvk = await import('../lib/kvkAvailability.mjs');
const { mergePowerProfilesIntoRows, powerProfileDoneAt } = await import('../lib/powerProfiles.mjs');
const { sanitizeFlamedragonInput } = await import('../lib/flamedragonForm.mjs');

const memberToken = await createMemberToken('m1');
const req = ({ body = {}, url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; };
const json = (res) => res.json();
const profile = () => (state.tables[T.POWER_PROFILES] || []).find((p) => p.member_id === 'm1');

const AVAIL = { name: 'Ann', member_id: 'm1', current_alliance: '710', availability: 'Full battle (12-17 UTC)' };
const SIX = { infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG6', archer_tier: 'T11', archer_tg: 'TG7' };
const OWN = { name: 'Ann', governor_gear: 'Infantry 1: Red T0', charms: 'Archer Charm 1: 5', hero_gear: 'x', pet_power: '1M', masters_power: '2M', mystic_trial_score: '9' };

// ---- pure helpers ----

test('missingTroopsMessage names exactly what is missing or invalid', () => {
  assert.equal(kvk.missingTroopsMessage(SIX), null);
  assert.match(kvk.missingTroopsMessage({}), /Missing: Infantry tier, Infantry TG, Cavalry tier, Cavalry TG, Archer tier, Archer TG\./);
  assert.match(kvk.missingTroopsMessage({ ...SIX, cavalry_tg: '', archer_tier: '  ' }), /Missing: Cavalry TG, Archer tier\./);
  assert.match(kvk.missingTroopsMessage({ ...SIX, infantry_tier: 'T9' }), /valid Infantry tier/);
  assert.match(kvk.missingTroopsMessage({ ...SIX, archer_tg: 'TG99' }), /valid Archer TG/);
});

test('sanitizeRequiredKvkTroops: all six required, heroes stay optional', () => {
  assert.equal(kvk.sanitizeRequiredKvkTroops(SIX).error, null);
  assert.deepEqual(Object.keys(kvk.sanitizeRequiredKvkTroops(SIX).fields).sort(), Object.keys(SIX).sort(), 'no heroes key when none were sent');
  assert.ok(kvk.sanitizeRequiredKvkTroops({}).error);
  assert.ok(kvk.sanitizeRequiredKvkTroops({ ...SIX, infantry_tg: null }).error);
  const { infantry_tier: _omit, ...fiveOnly } = SIX;
  assert.match(kvk.sanitizeRequiredKvkTroops(fiveOnly).error, /Infantry tier/);
  assert.equal(kvk.sanitizeRequiredKvkTroops({ ...SIX, heroes: [] }).error, null);
  assert.ok(kvk.sanitizeRequiredKvkTroops({ ...SIX, heroes: ['Nobody'] }).error);
});

test('sanitizeFlamedragonInput only enforces troops when asked to', () => {
  const base = { name: 'Ann', member_id: 'm1', pin: 'session' };
  assert.doesNotThrow(() => sanitizeFlamedragonInput(base));
  assert.throws(() => sanitizeFlamedragonInput(base, { requireTroops: true }), /Missing: Infantry tier/);
  assert.doesNotThrow(() => sanitizeFlamedragonInput({ ...base, ...SIX }, { requireTroops: true }));
});

test('troopFieldErrors flags each blank/invalid select with a message', () => {
  assert.deepEqual(kvk.troopFieldErrors(SIX), {});
  const errors = kvk.troopFieldErrors({ ...SIX, cavalry_tier: '', archer_tg: 'nope' });
  assert.deepEqual(Object.keys(errors).sort(), ['archer_tg', 'cavalry_tier']);
  assert.match(errors.cavalry_tier, /Choose a tier for Cavalry/);
  assert.equal(Object.keys(kvk.troopFieldErrors({})).length, 6);
});

test('buildTroopProfileSet writes only troop fields + heroes present, never Power Profile fields', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const set = kvk.buildTroopProfileSet({ ...SIX, governor_gear: 'X', pet_power: '5', name: 'Zed', updated_at: 'x' }, now);
  assert.deepEqual(Object.keys(set).sort(), [...Object.keys(SIX), 'troop_updated_at'].sort());
  assert.equal(set.troop_updated_at, now);
  assert.deepEqual(kvk.buildTroopProfileSet({ ...SIX, heroes: ['Saul', ' Saul ', ''] }, now).heroes, ['Saul']);
  assert.deepEqual(kvk.buildTroopProfileSet({ heroes: [] }, now).heroes, [], 'an empty list clears heroes');
  assert.equal(kvk.buildTroopProfileSet({}, now), null);
  assert.equal(kvk.buildTroopProfileSet({ name: 'only' }, now), null);
});

test('orderTroopSources: remembered profile troops outrank an earlier cycle; an old Power Profile stays last', () => {
  const record = { infantry_tier: 'T10' };
  const previous = { infantry_tier: 'T11' };
  const fresh = kvk.orderTroopSources({ record, previous, profile: { infantry_tier: 'T10', troop_updated_at: new Date() } });
  assert.deepEqual(fresh.map((s) => s.row === previous), [false, false, true]);
  assert.equal(kvk.resolveTroopPrefill(fresh).troops.infantry_tier, 'T10', 'record first, then profile');
  const old = kvk.orderTroopSources({ record: null, previous, profile: { infantry_tier: 'T10' } });
  assert.equal(kvk.resolveTroopPrefill(old).troops.infantry_tier, 'T11');
  assert.equal(kvk.resolveTroopPrefill(old).troopsFrom, 'previous');
});

test('powerProfileDoneAt: a troops-only document is not a filled-in Power Profile', () => {
  assert.equal(powerProfileDoneAt(null), null);
  assert.equal(powerProfileDoneAt({ member_id: 'm1', ...SIX, heroes: ['Saul'], troop_updated_at: new Date() }), null);
  assert.equal(powerProfileDoneAt({ member_id: 'm1', name: 'Ann' }), null);
  const at = new Date('2026-09-01T00:00:00Z');
  assert.equal(powerProfileDoneAt({ member_id: 'm1', updated_at: at }), at);
  assert.ok(powerProfileDoneAt({ member_id: 'm1', pet_power: '1M' }), 'legacy document with a field and no timestamp still counts');
  assert.equal(powerProfileDoneAt({ member_id: 'm1', pet_power: '', charms: null }), null);
});

test('mergePowerProfilesIntoRows: a troops-only profile does not blank names or gear and fills missing troops', () => {
  const rows = [{ member_id: 'm1', name: 'Ann Row', governor_gear: 'G', updated_at: '2026-10-02T00:00:00Z' }];
  const merged = mergePowerProfilesIntoRows(rows, [{ member_id: 'm1', ...SIX, heroes: ['Saul'], troop_updated_at: new Date() }])[0];
  assert.equal(merged.name, 'Ann Row');
  assert.equal(merged.governor_gear, 'G');
  assert.equal(merged.infantry_tier, 'T11');
  assert.deepEqual(merged.heroes, ['Saul']);
  assert.equal(merged.updated_at, '2026-10-02T00:00:00Z');
  const row = { member_id: 'm1', name: 'Ann Row', infantry_tier: 'T10', heroes: ['Thrud'] };
  assert.equal(mergePowerProfilesIntoRows([row], [{ member_id: 'm1', ...SIX }])[0].infantry_tier, 'T10', 'the event row still wins');
});

// ---- KvK Availability route ----

test('KvK POST: 400 with a plain message when any troop field is missing or invalid; nothing is saved', async () => {
  reset();
  for (const key of Object.keys(SIX)) {
    const body = { ...AVAIL, ...SIX };
    delete body[key];
    const res = await availRoute.POST(req({ body }));
    assert.equal(res.status, 400, key);
    assert.match((await json(res)).error, /Missing:/, key);
  }
  const blank = await availRoute.POST(req({ body: { ...AVAIL, ...SIX, archer_tg: '' } }));
  assert.equal(blank.status, 400);
  assert.match((await json(blank)).error, /Archer TG/);
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...SIX, cavalry_tier: 'T9' } }))).status, 400);
  assert.equal((await availRoute.POST(req({ body: AVAIL }))).status, 400);
  assert.equal((state.tables[T.SUBMISSIONS] || []).length, 0, 'no roster row from a rejected save');
  assert.equal(profile(), undefined, 'no profile from a rejected save');
});

test('KvK POST: heroes are optional and a save with only troops succeeds', async () => {
  reset();
  const res = await availRoute.POST(req({ body: { ...AVAIL, ...SIX } }));
  assert.equal(res.status, 200);
  assert.equal(profile().infantry_tier, 'T11');
  assert.equal('heroes' in profile(), false, 'heroes untouched when the form sent none');
});

test('KvK POST: troops + heroes are saved to the profile without a Power Profile, and later edits touch only those fields', async () => {
  reset();
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...SIX, heroes: ['Chenko', 'Saul'] } }))).status, 200);
  let p = profile();
  assert.equal(p.member_id, 'm1');
  assert.deepEqual({ ...p, _id: undefined, troop_updated_at: undefined }, { _id: undefined, member_id: 'm1', ...SIX, heroes: ['Chenko', 'Saul'], troop_updated_at: undefined });
  assert.equal(p.updated_at, undefined);
  assert.equal(p.created_at, undefined);
  assert.equal(p.name, undefined);
  // The member later fills in the Power Profile; then edits troops on the KvK form.
  assert.equal((await profileRoute.POST(req({ body: { ...OWN, member_id: 'm1' } }))).status, 200);
  p = profile();
  assert.equal(p.infantry_tier, 'T11', 'the Power Profile save does not wipe troops');
  assert.deepEqual(p.heroes, ['Chenko', 'Saul']);
  assert.equal(p.pet_power, '1M');
  const before = { ...p };
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...SIX, infantry_tier: 'T10', heroes: ['Saul'] } }))).status, 200);
  p = profile();
  assert.equal(p.infantry_tier, 'T10');
  assert.deepEqual(p.heroes, ['Saul']);
  for (const key of ['governor_gear', 'charms', 'hero_gear', 'pet_power', 'masters_power', 'mystic_trial_score', 'name', 'updated_at', 'created_at']) {
    assert.deepEqual(p[key], before[key], `${key} unchanged by a KvK save`);
  }
});

// ---- Flamedragon route ----

test('Flamedragon POST: 400 naming what is missing; nothing is saved', async () => {
  reset();
  const none = await dragonRoute.POST(req({ body: { name: 'Ann' } }));
  assert.equal(none.status, 400);
  assert.match((await json(none)).error, /Missing: Infantry tier, Infantry TG, Cavalry tier, Cavalry TG, Archer tier, Archer TG/);
  for (const key of Object.keys(SIX)) {
    const body = { name: 'Ann', ...SIX };
    delete body[key];
    assert.equal((await dragonRoute.POST(req({ body }))).status, 400, key);
  }
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', ...SIX, infantry_tg: 'TG99' } }))).status, 400);
  assert.equal((state.tables[T.FLAMEDRAGON_FORMS] || []).length, 0);
  assert.equal(profile(), undefined);
});

test('Flamedragon POST: remembers troops + heroes on the profile; only those fields change later', async () => {
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', ...OWN, updated_at: new Date('2026-09-01T00:00:00Z') }];
  const stamp = new Date('2026-09-01T00:00:00Z').getTime();
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', ...SIX, heroes: ['Saul'], pet_power: 'dragon-form-value', charms: 'Archer Charm 1: 1' } }))).status, 200);
  let p = profile();
  assert.equal(p.infantry_tier, 'T11');
  assert.deepEqual(p.heroes, ['Saul']);
  for (const key of ['governor_gear', 'charms', 'hero_gear', 'pet_power', 'masters_power', 'mystic_trial_score']) assert.equal(p[key], OWN[key], `${key} on the profile is not overwritten by the Flamedragon form`);
  assert.equal(new Date(p.updated_at).getTime(), stamp, 'the Power Profile save time is not bumped');
  // A save without a heroes list leaves profile heroes alone.
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', ...SIX, cavalry_tg: 'TG5' } }))).status, 200);
  p = profile();
  assert.equal(p.cavalry_tg, 'TG5');
  assert.deepEqual(p.heroes, ['Saul']);
});

// ---- the member does not count as having filled in the Power Profile ----

test('a troops-only profile does not flip Power Profile status, completion badge or the Power Profile page', async () => {
  reset();
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...SIX, heroes: ['Saul'] } }))).status, 200);
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', ...SIX } }))).status, 200);
  assert.equal(profile().updated_at, undefined);

  const statuses = Object.fromEntries((await json(await statusRoute.GET(req()))).forms.map((f) => [f.key, f]));
  assert.equal(statuses.lead.submitted, false, 'Power Profile still "not done"');
  assert.equal(statuses.joiner.submitted, true);
  assert.equal(statuses.dragon.submitted, true);
  const completions = await getMemberFormCompletions('m1');
  assert.equal(completions.lead, null);
  assert.ok(completions['kvk-hub']);

  const page = await json(await profileRoute.GET(req()));
  assert.equal(page.profile, null, 'the Power Profile page starts blank, no half-empty saved profile');
  assert.equal((await json(await memberProfileRoute.GET(req()))).profile, null, 'tools do not seed from a troops-only profile');

  // Saving the Power Profile for the first time reads as "created" and then marks it done.
  const saved = await json(await profileRoute.POST(req({ body: { ...OWN, member_id: 'm1' } })));
  assert.equal(saved.status, 'created');
  const after = Object.fromEntries((await json(await statusRoute.GET(req()))).forms.map((f) => [f.key, f]));
  assert.equal(after.lead.submitted, true);
  assert.ok((await getMemberFormCompletions('m1')).lead);
  assert.equal((await json(await profileRoute.GET(req()))).profile.pet_power, '1M');
  assert.equal(profile().infantry_tier, 'T11');
});

test('KvK GET prefill still reads the remembered profile troops', async () => {
  reset();
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', ...SIX, heroes: ['Saul'] } }))).status, 200);
  const got = await json(await availRoute.GET(req()));
  assert.equal(got.record, null);
  assert.equal(got.prefill.troops.cavalry_tg, 'TG6');
  assert.deepEqual(got.prefill.heroes, ['Saul']);
  assert.notEqual(got.prefill.troopsFrom, null);
  // and the Power Profile alone (old data without troop_updated_at) still prefills as before
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann', infantry_tier: 'T10', infantry_tg: 'TG5', heroes: ['Saul'] }];
  const old = await json(await availRoute.GET(req()));
  assert.equal(old.prefill.troops.infantry_tier, 'T10');
  assert.equal(old.prefill.troopsFrom, 'profile');
});
