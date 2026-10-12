import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

// The Flamedragon Tyrant form shares gear, charms, Pet Power and Masters Power with the Power Profile:
// a Flamedragon save writes them across, the newest save wins when either form is opened, and the scan
// save from the Flamedragon form follows the Flamedragon gate (never the Power Profile's).

const state = { tables: {} };
globalThis.__dragonPPTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:dpp-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:dpp-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:dpp-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:dpp-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__dragonPPTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'dragon-power-profile-test-only';
const dragonRoute = await import('../app/api/flamedragon/route.js');
const profileRoute = await import('../app/api/power-profile/route.js');
const loadoutRoute = await import('../app/api/power-profile/loadout/route.js');
const { COLLECTIONS: T } = await import('../lib/mongoCollections.js');
const { resolvePowerPrefill, sanitizeFlamedragonInput, SHARED_POWER_KEYS } = await import('../lib/flamedragonForm.mjs');
const { saveLoadoutToProfile } = await import('../lib/troopProfile.server.js');

const token = await createMemberToken('m1');
const req = ({ body = {}, url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (k === 'k710_member_session' ? { value: token } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; };
const json = (res) => res.json();
const profile = () => (state.tables[T.POWER_PROFILES] || []).find((p) => p.member_id === 'm1');
const H = 3600e3;
const gate = (formKey, open) => ({ form_key: formKey, is_open: open, ...(open ? { opens_at: new Date(Date.now() - H), closes_at: new Date(Date.now() + H), cycle_id: 'c1' } : {}) });
const setGates = ({ lead, dragon }) => { state.tables[T.FORM_GATES] = [gate('lead', lead), gate('dragon', dragon)]; };

const SIX = { infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG6', archer_tier: 'T11', archer_tg: 'TG7' };
const GEAR = 'Infantry 1: Red T1 ★★ | Cavalry 1: Gold T3 ★';
const CHARMS = 'Infantry Charm 1: Level 13 | Cavalry Charm 1: Level 5';
const POWER = { governor_gear: GEAR, charms: CHARMS, pet_power: '1,500,000', masters_power: '2,250,000' };
const dragonPost = (extra = {}) => dragonRoute.POST(req({ body: { name: 'Ann', ...SIX, ...POWER, ...extra } }));

// ---- pure helpers ----

test('resolvePowerPrefill: the newest save wins per field, a blank never wipes an answer', () => {
  const older = new Date('2026-01-01T00:00:00Z');
  const newer = new Date('2026-02-01T00:00:00Z');
  const answer = { governor_gear: 'Infantry 1: Red T0', charms: '', pet_power: '100', masters_power: '', updated_at: older };
  const profile = { governor_gear: 'Infantry 1: Gold T1', charms: 'Infantry Charm 1: Level 3', pet_power: '', masters_power: '900', updated_at: newer };
  assert.deepEqual(resolvePowerPrefill({ answer, profile }), {
    governor_gear: 'Infantry 1: Gold T1', charms: 'Infantry Charm 1: Level 3', pet_power: '100', masters_power: '900', from: 'profile',
  });
  // The form answer is newer: it wins where it has a value; the profile still fills what the answer lacks.
  const out = resolvePowerPrefill({ answer: { ...answer, updated_at: newer }, profile: { ...profile, updated_at: older } });
  assert.equal(out.governor_gear, 'Infantry 1: Red T0');
  assert.equal(out.pet_power, '100');
  assert.equal(out.charms, 'Infantry Charm 1: Level 3', 'profile fills a field the answer never had');
  // Same save time (a Flamedragon save stamps both with one time): not "newer".
  assert.equal(resolvePowerPrefill({ answer: { ...answer, updated_at: newer }, profile: { ...profile, updated_at: newer } }).governor_gear, 'Infantry 1: Red T0');
  assert.deepEqual(resolvePowerPrefill({}), { governor_gear: '', charms: '', pet_power: '', masters_power: '', from: null });
  assert.equal(resolvePowerPrefill({ answer, profile: null }).from, 'answer');
});

test('sanitizeFlamedragonInput: Pet / Masters follow the Power Profile number rule', () => {
  const base = { name: 'A', member_id: 'm1', pin: 'x', ...SIX };
  const ok = sanitizeFlamedragonInput({ ...base, pet_power: '1,500,000', masters_power: ' 0 ' }, { requireTroops: true });
  assert.equal(ok.pet_power, '1500000');
  assert.equal(ok.masters_power, '0');
  assert.equal(sanitizeFlamedragonInput({ ...base, pet_power: '' }, { requireTroops: true }).pet_power, '', 'optional');
  for (const bad of ['1.5M', 'lots', '100,000,001', '-5']) {
    assert.throws(() => sanitizeFlamedragonInput({ ...base, pet_power: bad }, { requireTroops: true }), (e) => e.field === 'pet_power' && /^Pet Power/.test(e.message), bad);
  }
  assert.throws(() => sanitizeFlamedragonInput({ ...base, masters_power: 'x' }, { requireTroops: true }), (e) => e.field === 'masters_power');
  // Gear / charms keep the shared canonical format and reject values that are not real options.
  assert.equal(sanitizeFlamedragonInput({ ...base, governor_gear: GEAR, charms: CHARMS }, { requireTroops: true }).governor_gear, GEAR);
  assert.throws(() => sanitizeFlamedragonInput({ ...base, charms: 'Archer Charm 1: 99' }, { requireTroops: true }), /not a valid charm level/);
  assert.deepEqual(SHARED_POWER_KEYS, ['governor_gear', 'charms', 'pet_power', 'masters_power']);
});

test('saveLoadoutToProfile: writes only the shared keys it is given and never Mystic Trial', async () => {
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann', hero_gear: 'hg', mystic_trial_score: '77', infantry_tier: 'T11', heroes: ['Saul'], charms: 'old' }];
  const when = new Date('2026-03-01T00:00:00Z');
  assert.equal(await saveLoadoutToProfile('m1', { pet_power: '5', mystic_trial_score: '1', hero_gear: 'bad', name: 'Zed' }, { now: when, name: 'Other' }), true);
  const p = profile();
  assert.equal(p.pet_power, '5');
  assert.equal(p.charms, 'old', 'a key that was not sent is untouched');
  assert.equal(p.hero_gear, 'hg');
  assert.equal(p.mystic_trial_score, '77');
  assert.equal(p.name, 'Ann', 'an existing name is kept');
  assert.deepEqual(p.heroes, ['Saul']);
  assert.equal(p.updated_at, when);
  assert.equal(await saveLoadoutToProfile('m1', {}), false, 'nothing to write');
  assert.equal(await saveLoadoutToProfile('', { charms: 'x' }), false);
});

// ---- POST: save across ----

test('Flamedragon POST creates the Power Profile (with the name) when there is none', async () => {
  reset();
  setGates({ lead: true, dragon: true });
  const res = await dragonPost();
  assert.equal(res.status, 200);
  const p = profile();
  assert.equal(p.name, 'Ann');
  assert.equal(p.governor_gear, GEAR);
  assert.equal(p.charms, CHARMS);
  assert.equal(p.pet_power, '1500000');
  assert.equal(p.masters_power, '2250000');
  assert.equal(p.mystic_trial_score, undefined, 'Mystic Trial is never written from a typed value');
  const row = state.tables[T.FLAMEDRAGON_FORMS][0];
  assert.equal(row.governor_gear, GEAR);
  assert.equal(row.pet_power, '1500000');
  assert.equal(new Date(row.updated_at).getTime(), new Date(p.updated_at).getTime(), 'one save time on both');
  // The Power Profile now shows it.
  const seen = (await json(await profileRoute.GET(req()))).profile;
  assert.equal(seen.governor_gear, GEAR);
  assert.equal(seen.charms, CHARMS);
  assert.equal(seen.pet_power, '1500000');
  assert.equal(seen.masters_power, '2250000');
});

test('Flamedragon POST leaves every other profile field alone, and a typed Mystic Trial is ignored', async () => {
  reset();
  setGates({ lead: true, dragon: true });
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann P', hero_gear: 'hg', mystic_trial_score: '9', governor_gear: 'Infantry 1: Red T0', updated_at: new Date('2026-01-01') }];
  assert.equal((await dragonPost({ mystic_trial_score: '123456', hero_gear: 'evil', heroes: ['Saul'] })).status, 200);
  const p = profile();
  assert.equal(p.hero_gear, 'hg');
  assert.equal(p.mystic_trial_score, '9');
  assert.equal(p.name, 'Ann P');
  assert.equal(p.governor_gear, GEAR);
  assert.deepEqual(p.heroes, ['Saul']);
  assert.equal(state.tables[T.FLAMEDRAGON_FORMS][0].mystic_trial_score, null);
});

test('Flamedragon POST: a partial body only writes across what it sent; an empty value clears', async () => {
  reset();
  setGates({ lead: true, dragon: true });
  assert.equal((await dragonPost()).status, 200);
  assert.equal((await dragonRoute.POST(req({ body: { ...SIX, pet_power: '', cavalry_tg: 'TG5' } }))).status, 200);
  const p = profile();
  assert.equal(p.pet_power, null);
  assert.equal(p.masters_power, '2250000');
  assert.equal(p.charms, CHARMS);
});

test('Flamedragon POST: a bad Pet Power is a 400 naming the field and nothing is saved anywhere', async () => {
  reset();
  setGates({ lead: true, dragon: true });
  const res = await dragonPost({ pet_power: '1.5M' });
  assert.equal(res.status, 400);
  const body = await json(res);
  assert.equal(body.field, 'pet_power');
  assert.match(body.error, /^Pet Power: /);
  assert.equal((state.tables[T.FLAMEDRAGON_FORMS] || []).length, 0);
  assert.equal(profile(), undefined);
});

test('gates: a closed Power Profile form does not block the Flamedragon save; a closed Flamedragon form does', async () => {
  reset();
  setGates({ lead: false, dragon: true });
  assert.equal((await dragonPost()).status, 200);
  assert.equal(profile().governor_gear, GEAR, 'written across even though the Power Profile form is closed');
  reset();
  setGates({ lead: true, dragon: false });
  assert.equal((await dragonPost()).status, 403);
  assert.equal(profile(), undefined);
  assert.equal((state.tables[T.FLAMEDRAGON_FORMS] || []).length, 0);
});

// ---- scan save from the Flamedragon form ----

const scanBody = (extra = {}) => ({ governor_gear: GEAR, charms: CHARMS, corrections: [{ slot: 'hat', field: 'tier', read_value: 2, read_confidence: 0.7, corrected_value: 3 }], ...extra });

test('scan save with source "dragon" follows the Flamedragon gate, keeps corrections, and shows on the Power Profile', async () => {
  reset();
  setGates({ lead: false, dragon: true });
  const res = await loadoutRoute.POST(req({ body: scanBody({ source: 'dragon' }) }));
  assert.equal(res.status, 200);
  assert.equal((await json(res)).corrections_saved, 1);
  assert.equal(profile().governor_gear, GEAR);
  assert.equal(state.tables[T.SCAN_CORRECTIONS].length, 1);
  reset();
  setGates({ lead: true, dragon: false });
  const closed = await loadoutRoute.POST(req({ body: scanBody({ source: 'dragon' }) }));
  assert.equal(closed.status, 403);
  assert.equal(profile(), undefined);
});

test('scan save without source still follows the Power Profile gate (not weakened)', async () => {
  reset();
  setGates({ lead: false, dragon: true });
  assert.equal((await loadoutRoute.POST(req({ body: scanBody() }))).status, 403);
  assert.equal((await loadoutRoute.POST(req({ body: scanBody({ source: 'something-else' }) }))).status, 403);
  assert.equal(profile(), undefined);
  setGates({ lead: true, dragon: false });
  assert.equal((await loadoutRoute.POST(req({ body: scanBody() }))).status, 200);
});

// ---- GET: prefill precedence ----

test('GET: the newer Power Profile values are offered over an older Flamedragon answer', async () => {
  reset();
  setGates({ lead: true, dragon: true });
  assert.equal((await dragonPost()).status, 200);
  // Later the member changes Pet Power and a charm on the Power Profile.
  const p = profile();
  p.pet_power = '9000000';
  p.charms = 'Infantry Charm 1: Level 16';
  p.updated_at = new Date(Date.now() + 60_000);
  const got = await json(await dragonRoute.GET(req()));
  assert.equal(got.record.pet_power, '1500000', 'the stored answer is unchanged');
  assert.equal(got.power.pet_power, '9000000');
  assert.equal(got.power.charms, 'Infantry Charm 1: Level 16');
  assert.equal(got.power.masters_power, '2250000');
  assert.equal(got.power.from, 'profile');
});

test('GET: an older Power Profile does not replace the Flamedragon answer; no answer starts from the profile', async () => {
  reset();
  setGates({ lead: true, dragon: true });
  assert.equal((await dragonPost()).status, 200);
  profile().pet_power = '1';
  profile().updated_at = new Date('2020-01-01');
  const got = await json(await dragonRoute.GET(req()));
  assert.equal(got.power.pet_power, '1500000');
  assert.equal(got.power.from, 'answer');
  // A member with only a Power Profile.
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann', governor_gear: GEAR, charms: CHARMS, pet_power: '42', masters_power: '43', updated_at: new Date('2026-01-01') }];
  const fresh = await json(await dragonRoute.GET(req()));
  assert.equal(fresh.record, null);
  assert.deepEqual({ ...fresh.power }, { governor_gear: GEAR, charms: CHARMS, pet_power: '42', masters_power: '43', from: 'profile' });
});

test('GET: a profile holding only remembered troops offers nothing for gear and power', async () => {
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', infantry_tier: 'T11', troop_updated_at: new Date() }];
  const got = await json(await dragonRoute.GET(req()));
  assert.equal(got.power.from, null);
  assert.equal(got.power.governor_gear, '');
});

test('GET reports the Mystic Trial from the sign-in, read-only', async () => {
  reset();
  state.tables[T.KINGSHOT_USERS] = [{ player_id: 'm1', kingdom_id: 710, mystic_trial: 48250 }];
  const got = await json(await dragonRoute.GET(req()));
  assert.deepEqual(got.mystic, { value: '48250', source: 'login' });
  reset();
  state.tables[T.FLAMEDRAGON_FORMS] = [{ member_id: 'm1', name: 'Ann', mystic_trial_score: '1234', updated_at: new Date() }];
  assert.deepEqual((await json(await dragonRoute.GET(req()))).mystic, { value: '1234', source: 'saved' });
  reset();
  assert.deepEqual((await json(await dragonRoute.GET(req()))).mystic, { value: '', source: 'none' });
});
