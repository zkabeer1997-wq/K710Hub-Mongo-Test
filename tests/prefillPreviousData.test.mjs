import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__prefillTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:pf-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:pf-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:pf-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:pf-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__prefillTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'prefill-test-only';
process.env.ADMIN_PASSWORD = 'prefill-admin-only';
const control = await import('../app/api/admin-event-control/route.js');
const availRoute = await import('../app/api/kvk-availability/route.js');
const profileRoute = await import('../app/api/power-profile/route.js');
const dragonRoute = await import('../app/api/flamedragon/route.js');
const prepRoute = await import('../app/api/prep-backpack/route.js');
const nobleRoute = await import('../app/api/noble-advisor/route.js');
const apptRoute = await import('../app/api/kvk-appointments/route.js');
const voteRoute = await import('../app/api/event-participation/route.js');
const requestsRoute = await import('../app/api/website-requests/route.js');
const adminSubs = await import('../app/api/admin-submissions/route.js');
const statusRoute = await import('../app/api/member-form-status/route.js');
const cycles = await import('../lib/eventCycles.server.js');
const { COLLECTIONS: T } = await import('../lib/mongoCollections.js');
const { sanitizeKvkTroops, resolveTroopPrefill } = await import('../lib/kvkAvailability.mjs');
const { mergePowerProfilesIntoRows } = await import('../lib/powerProfiles.mjs');

const adminToken = await mintAdminToken();
const memberToken = await createMemberToken('m1');
const req = ({ body = {}, as = 'member', url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; cycles.resetCycleBackfillCache(); };
const startCycle = (type, label) => control.POST(req({ as: 'admin', body: { type, action: 'start_cycle', label } }));
const statuses = async () => Object.fromEntries((await (await statusRoute.GET(req())).json()).forms.map((f) => [f.key, f]));
const json = async (res) => res.json();

const AVAIL = { name: 'Ann', member_id: 'm1', current_alliance: '710', availability: 'Full battle (12-17 UTC)' };
const TROOPS = { infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG6', archer_tier: 'T11', archer_tg: 'TG7', heroes: ['Zoe', 'Rosa'] };

test('sanitizeKvkTroops: absent fields untouched, blanks clear, bad values rejected', () => {
  assert.deepEqual(sanitizeKvkTroops({}), { fields: {}, error: null });
  assert.deepEqual(sanitizeKvkTroops({ infantry_tier: 'T10', cavalry_tg: '', heroes: ['Zoe', 'Zoe'] }).fields, { infantry_tier: 'T10', cavalry_tg: null, heroes: ['Zoe'] });
  assert.match(sanitizeKvkTroops({ infantry_tier: 'T9' }).error, /Infantry tier/);
  assert.match(sanitizeKvkTroops({ archer_tg: 'TG99' }).error, /Archer TG/);
  assert.ok(sanitizeKvkTroops({ heroes: ['Nobody'] }).error);
  assert.ok(sanitizeKvkTroops({ heroes: 'Zoe' }).error);
});

test('resolveTroopPrefill: per-field fallback record > previous > profile, invalid options dropped', () => {
  const out = resolveTroopPrefill([
    { row: { infantry_tier: 'T11', heroes: [] }, from: 'record' },
    { row: { infantry_tier: 'T10', infantry_tg: 'TG8', archer_tier: 'T9', heroes: ['Zoe', 'Ghost'] }, from: 'previous' },
    { row: { cavalry_tg: 'TG5', heroes: ['Rosa'] }, from: 'profile' },
  ]);
  assert.equal(out.troops.infantry_tier, 'T11');
  assert.equal(out.troops.infantry_tg, 'TG8');
  assert.equal(out.troops.archer_tier, '');
  assert.equal(out.troops.cavalry_tg, 'TG5');
  assert.deepEqual(out.heroes, ['Zoe']);
  assert.equal(out.troopsFrom, 'profile');
  assert.equal(out.heroesFrom, 'previous');
});

test('KvK availability accepts, validates and stores troop levels and heroes', async () => {
  reset();
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, infantry_tier: 'T9' } }))).status, 400);
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, heroes: ['Nope'] } }))).status, 400);
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...TROOPS } }))).status, 200);
  const row = state.tables[T.SUBMISSIONS][0];
  assert.equal(row.infantry_tier, 'T11');
  assert.deepEqual(row.heroes, ['Zoe', 'Rosa']);
  // an old client that omits the fields does not wipe them
  assert.equal((await availRoute.POST(req({ body: AVAIL }))).status, 200);
  assert.deepEqual(state.tables[T.SUBMISSIONS][0].heroes, ['Zoe', 'Rosa']);
  const got = await json(await availRoute.GET(req()));
  assert.equal(got.prefill.troops.cavalry_tg, 'TG6');
  assert.deepEqual(got.record.heroes, ['Zoe', 'Rosa']);
});

test('Power Profile no longer writes troop levels or heroes and keeps the old ones', async () => {
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann', pet_power: '1M', infantry_tier: 'T10', heroes: ['Zoe'] }];
  const res = await profileRoute.POST(req({ body: { name: 'Ann', member_id: 'm1', pet_power: '2M', infantry_tier: 'T11', heroes: ['Rosa'] } }));
  assert.equal(res.status, 200);
  const stored = state.tables[T.POWER_PROFILES][0];
  assert.equal(stored.pet_power, '2M');
  assert.equal(stored.infantry_tier, 'T10', 'old value kept, new one ignored');
  assert.deepEqual(stored.heroes, ['Zoe']);
});

test('old Power Profile troops/heroes prefill KvK Availability, and the admin view prefers the availability row', async () => {
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann', infantry_tier: 'T10', infantry_tg: 'TG5', heroes: ['Zoe'] }];
  state.tables[T.SUBMISSIONS] = [{ member_id: 'm1', name: 'Ann', availability: 'Not Available', current_alliance: 'RED' }];
  const got = await json(await availRoute.GET(req()));
  assert.equal(got.prefill.troops.infantry_tier, 'T10');
  assert.deepEqual(got.prefill.heroes, ['Zoe']);
  assert.equal(got.prefill.troopsFrom, 'profile');

  let admin = await json(await adminSubs.GET(req({ as: 'admin' })));
  assert.equal(admin.rows[0].infantry_tier, 'T10', 'fallback to profile when the row lacks troops');
  assert.deepEqual(admin.rows[0].heroes, ['Zoe']);
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...TROOPS } }))).status, 200);
  admin = await json(await adminSubs.GET(req({ as: 'admin' })));
  assert.equal(admin.rows[0].infantry_tier, 'T11');
  assert.deepEqual(admin.rows[0].heroes, ['Zoe', 'Rosa']);
  const merged = mergePowerProfilesIntoRows([{ member_id: 'x', infantry_tier: 'T11', heroes: [] }], [{ member_id: 'x', infantry_tier: 'T10', heroes: ['Rosa'] }]);
  assert.equal(merged[0].infantry_tier, 'T11');
  assert.deepEqual(merged[0].heroes, ['Rosa']);
});

test('a new KvK cycle offers last cycle troops/heroes and shows the carried-over state', async () => {
  reset();
  assert.equal((await availRoute.POST(req({ body: { ...AVAIL, ...TROOPS } }))).status, 200);
  await startCycle('kvk', 'KvK 2');
  const got = await json(await availRoute.GET(req()));
  assert.equal(got.record, null);
  assert.deepEqual(got.previous.heroes, ['Zoe', 'Rosa']);
  assert.equal(got.prefill.troops.archer_tg, 'TG7');
  assert.equal(got.prefill.troopsFrom, 'previous');
  assert.equal((await statuses()).joiner.carriedOver, true);
});

test('never-filled forms start from a Power Profile name (status baseLabel, GET fallbacks)', async () => {
  reset();
  state.tables[T.POWER_PROFILES] = [{ member_id: 'm1', name: 'Ann Profile', charms: 'Archer Charm 1: 5', infantry_tier: 'T10', heroes: ['Zoe'] }];
  state.tables.kingshot_users = [{ player_id: 'm1', nickname: 'Ann Nick', alliance_abbr: 'SKY' }];
  const s = await statuses();
  for (const k of ['joiner', 'prep', 'dragon', 'noble']) assert.equal(s[k].baseLabel, 'your Power Profile', k);
  assert.equal(s.lead.baseLabel, null, 'a saved profile is not "prefilled from itself"');
  assert.equal((await json(await availRoute.GET(req()))).base.name, 'Ann Profile');
  assert.equal((await json(await prepRoute.GET(req()))).base.name, 'Ann Profile');
  assert.equal((await json(await nobleRoute.GET(req()))).profile_name, 'Ann Profile');
  const dragon = (await json(await dragonRoute.GET(req()))).fallback;
  assert.equal(dragon.name, 'Ann Profile');
  assert.equal(dragon.charms, 'Archer Charm 1: 5');
  assert.deepEqual(dragon.heroes, ['Zoe']);
  assert.equal((await json(await requestsRoute.GET(req()))).profile.name, 'Ann Profile');
  // only a Kingshot profile: name + alliance come from it
  delete state.tables[T.POWER_PROFILES];
  const base = (await json(await availRoute.GET(req()))).base;
  assert.equal(base.name, 'Ann Nick');
  assert.equal(base.current_alliance, 'SKY');
  assert.equal((await json(await availRoute.GET(req()))).base.from, 'your Kingshot profile');
  const lead = await json(await profileRoute.GET(req({ url: 'http://x/api/power-profile?member_id=m1' })));
  assert.equal(lead.profile, null);
  assert.equal(lead.base.name, 'Ann Nick');
});

test('older untagged rows are offered as previous once a newer cycle starts', async () => {
  reset();
  state.tables[T.PREP_BACKPACK] = [{ member_id: 'm1', in_game_name: 'Old Ann', notes: 'legacy' }];
  state.tables[T.SUBMISSIONS] = [{ member_id: 'm1', name: 'Old Ann', current_alliance: 'RED', availability: 'Full battle (12-17 UTC)', infantry_tier: 'T10', pin_hash: 'secret' }];
  await cycles.getCurrentEventCycle('kvk');
  await startCycle('kvk', 'KvK 2');
  const prep = await json(await prepRoute.GET(req()));
  assert.equal(prep.record, null);
  assert.equal(prep.previous.notes, 'legacy');
  const avail = await json(await availRoute.GET(req()));
  assert.equal(avail.previous.current_alliance, 'RED');
  assert.equal(avail.prefill.troops.infantry_tier, 'T10');
  assert.equal(JSON.stringify(avail).includes('secret'), false);
});

test('KvK appointments and event votes offer the previous cycle/round answers', async () => {
  reset();
  state.tables[T.KVK_APPOINTMENT_APPLICATIONS] = [
    { member_id: 'm1', day: 1, buff: 'construction', cycle_id: 'old', tg: 5, ttg: 6, speedup_days: 7, preferred_hours: ['01:00', '02:00', '03:00'], updated_at: new Date('2026-01-01') },
    { member_id: 'm1', day: 1, buff: 'construction', cycle_id: 'older', tg: 1, ttg: 1, speedup_days: 1, preferred_hours: ['04:00', '05:00', '06:00'], updated_at: new Date('2025-01-01') },
  ];
  const appts = await json(await apptRoute.GET(req()));
  assert.equal(appts.applications.length, 0);
  assert.equal(appts.previousApplications.length, 1);
  assert.equal(appts.previousApplications[0].tg, 5, 'newest earlier answer wins');
  assert.ok(appts.previousLabel);

  state.tables[T.FORM_GATES] = [{ form_key: 'swordland', is_open: true, opens_at: new Date(Date.now() - 3600e3), closes_at: new Date(Date.now() + 3600e3), cycle_id: 'r2' }];
  state.tables[T.EVENT_PARTICIPATION] = [{ member_id: 'm1', form_id: 'swordland-showdown', cycle_id: 'r1', vote: 'flexible', power: 123456, updated_at: new Date('2026-01-01') }];
  const vote = await json(await voteRoute.GET(req({ url: 'http://x/api/event-participation?form=swordland-showdown' })));
  assert.equal(vote.entry, null);
  assert.equal(vote.previous.vote, 'flexible');
  assert.equal(vote.previous.power, 123456);
});
