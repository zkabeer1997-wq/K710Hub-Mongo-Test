import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__prepHalfTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:prep-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(adminAuth|memberAuth|mongoCollections|eventCycles\.server)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:prep-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__prepHalfTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'prep-half-test-only';
process.env.ADMIN_PASSWORD = 'prep-half-admin-only';
const prep = await import('../app/api/prep-backpack/route.js');
const adminPrep = await import('../app/api/admin-prep-backpack/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const { APPOINTMENTS, schedule } = await import('../app/admin/dashboard/prepScheduler.mjs');
const { TIME_SLOTS, NOBLE_TIME_SLOTS, normalizePrepRowSlots } = await import('../lib/nobleAdvisor.mjs');
const memberToken = await createMemberToken('member-a');
const adminToken = await mintAdminToken();
const req = ({ body = {}, as = 'member' } = {}) => ({
  url: 'http://x/api',
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const save = (extra = {}) => prep.POST(req({ body: { in_game_name: 'Ann', want_construction: 'Yes', avail_day1: ['00:00'], ...extra } }));

test('prep slots use the same 48-entry half-hour grid as the Noble Advisor', () => {
  assert.equal(TIME_SLOTS.length, 48);
  assert.deepEqual(TIME_SLOTS, NOBLE_TIME_SLOTS);
  assert.deepEqual(APPOINTMENTS, NOBLE_TIME_SLOTS);
  assert.equal(APPOINTMENTS[0], '00:00');
  assert.equal(APPOINTMENTS[47], '23:30');
});

test('member POST rejects :15/:45 and unknown times, accepts the grid and dedupes', async () => {
  for (const bad of ['00:15', '23:45', '12:45', '24:00', 'noon']) {
    assert.equal((await save({ avail_day2: [bad] })).status, 400, bad);
    assert.equal((await save({ avail_day5: ['00:00', bad] })).status, 400, bad);
  }
  assert.equal((await save({ avail_day4: 'nope' })).status, 400);
  assert.equal((await save({ avail_day1: ['00:00', '00:00', '23:30'], avail_day2: ['12:30'] })).status, 200);
  const row = state.tables[COLLECTIONS.PREP_BACKPACK][0];
  assert.deepEqual(row.avail_day1, ['00:00', '23:30']);
});

test('legacy :15/:45 values are snapped down and merged on member and admin reads', async () => {
  await save();
  const cycleId = state.tables[COLLECTIONS.PREP_BACKPACK][0].event_cycle_id;
  state.tables[COLLECTIONS.PREP_BACKPACK] = [{
    member_id: 'member-a', in_game_name: 'Ann', event_cycle_id: cycleId,
    avail_day1: ['23:45', '00:15', '00:45', '01:15', '00:00', '00:30'], avail_day2: ['12:45'], avail_day4: [], avail_day5: ['03:15'],
  }];
  assert.deepEqual(normalizePrepRowSlots(state.tables[COLLECTIONS.PREP_BACKPACK][0]).avail_day1, ['23:30', '00:00', '00:30', '01:00']);
  const got = await (await adminPrep.GET(req({ as: 'admin' }))).json();
  const row = got.rows.find((r) => r.member_id === 'member-a');
  assert.ok(row, 'legacy row is listed');
  {
    assert.deepEqual(row.avail_day1, ['23:30', '00:00', '00:30', '01:00']);
    assert.deepEqual(row.avail_day2, ['12:30']);
    assert.deepEqual(row.avail_day5, ['03:00']);
  }
  // stored data is not rewritten by a read
  assert.deepEqual(state.tables[COLLECTIONS.PREP_BACKPACK][0].avail_day1[0], '23:45');
});

test('admin PATCH validates slot lists', async () => {
  await save();
  const id = String(state.tables[COLLECTIONS.PREP_BACKPACK].find((r) => r.in_game_name === 'Ann')._id);
  assert.equal((await adminPrep.PATCH(req({ as: 'admin', body: { id, key: 'avail_day1', value: ['00:15'] } }))).status, 400);
  assert.equal((await adminPrep.PATCH(req({ as: 'admin', body: { id, key: 'avail_day1', value: ['00:30'] } }))).status, 200);
});

test('scheduler places people on the half-hour grid with 48 rows and no crossover', () => {
  const rows = [
    { id: 'a', member_id: '1', in_game_name: 'A', want_construction: 'Yes', construction_upgrades: ['TG8'], avail_day1: ['23:30', '00:00'], want_research: 'Yes', avail_day2: ['00:00'] },
    { id: 'b', member_id: '2', in_game_name: 'B', want_construction: 'Yes', construction_upgrades: ['TG5'], avail_day1: ['00:00'] },
  ];
  const out = schedule(rows);
  for (const d of out.days) assert.equal(d.rows.length, 48);
  const day1 = out.days.find((d) => d.day === 1).rows;
  assert.equal(day1[0].time, '00:00');
  assert.equal(day1[0].member, 'A');
  assert.equal(day1[47].time, '23:30');
  assert.equal(out.days.find((d) => d.day === 2).rows[0].member, 'A');
  assert.equal(out.crossoverId, null);
  assert.equal(day1.find((r) => r.member === 'B'), undefined);
});
