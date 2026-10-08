import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__kvkApptTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:kvk-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(adminAuth|memberAuth|mongoCollections|eventCycles\.server)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:kvk-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__kvkApptTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'kvk-appt-test-only';
process.env.ADMIN_PASSWORD = 'kvk-appt-admin-only';
const member = await import('../app/api/kvk-appointments/route.js');
const schedule = await import('../app/api/kvk-appointments/schedule/route.js');
const admin = await import('../app/api/admin-kvk-appointments/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const tokens = { a: await createMemberToken('member-a'), b: await createMemberToken('member-b') };
const adminToken = await mintAdminToken();
const req = ({ body = {}, as = null, url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as && as !== 'admin' && k === 'k710_member_session' ? { value: tokens[as] } : undefined) },
});
const apply = (as, extra = {}) => member.POST(req({ as, body: { day: 1, buff: 'construction', tg: 100, ttg: 0, speedup_days: 0, preferred_hours: ['05:00', '06:00', '07:00'], ...extra } }));

test('member routes require a member session', async () => {
  assert.equal((await member.GET(req())).status, 401);
  assert.equal((await member.POST(req())).status, 401);
  assert.equal((await schedule.GET(req())).status, 401);
});

test('admin route rejects anonymous and plain members', async () => {
  for (const as of [null, 'a']) {
    assert.equal((await admin.GET(req({ as }))).status, 401);
    assert.equal((await admin.POST(req({ as, body: { action: 'publish', published: true } }))).status, 401);
  }
});

test('apply validates, closed gate blocks, and saving twice overwrites one row', async () => {
  assert.equal((await apply('a', { preferred_hours: ['05:00', '06:00'] })).status, 400);
  state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'appointments', is_open: false }];
  assert.equal((await apply('a')).status, 403);
  state.tables[COLLECTIONS.FORM_GATES] = [];
  assert.equal((await apply('a')).status, 200);
  assert.equal((await apply('a', { tg: 999 })).status, 200);
  const rows = state.tables[COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS];
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].member_id, rows[0].cycle_id, rows[0].tg], ['member-a', 'current', 999]);
  const mine = await (await member.GET(req({ as: 'a' }))).json();
  assert.equal(mine.applications.length, 1);
  assert.equal(mine.published, false);
});

test('auto-allocate: no double booking, unpublished assignments hidden, publish exposes only names', async () => {
  assert.equal((await apply('b', { tg: 5000, preferred_hours: ['05:00', '06:00', '07:00'] })).status, 200);
  let res = await admin.POST(req({ as: 'admin', body: { action: 'auto_allocate' } }));
  assert.equal(res.status, 200);
  const asg = state.tables[COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS];
  assert.equal(asg.length, 2);
  assert.equal(new Set(asg.map((a) => a.slot)).size, 2);
  assert.equal(asg.find((a) => a.member_id === 'member-b').slot, '05:00'); // higher contribution
  // Not published yet: member sees no assignment and no schedule.
  assert.deepEqual((await (await member.GET(req({ as: 'b' }))).json()).assignments, []);
  assert.deepEqual(await (await schedule.GET(req({ as: 'b' }))).json(), { published: false, days: [] });
  // Re-running is idempotent.
  await admin.POST(req({ as: 'admin', body: { action: 'auto_allocate' } }));
  assert.equal(state.tables[COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS].length, 2);
  await admin.POST(req({ as: 'admin', body: { action: 'publish', published: true } }));
  const mine = await (await member.GET(req({ as: 'b' }))).json();
  assert.deepEqual(mine.assignments, [{ day: 1, buff: 'construction', slot: '05:00' }]);
  const sched = await (await schedule.GET(req({ as: 'a' }))).json();
  assert.equal(sched.published, true);
  assert.equal(JSON.stringify(sched).includes('member-'), false);
  assert.equal(sched.days.find((d) => d.day === 1).filled, 2);
});

test('manual assign keeps its slot through auto-allocate and rejects a taken slot', async () => {
  let res = await admin.POST(req({ as: 'admin', body: { action: 'assign', day: 1, buff: 'construction', member_id: 'member-a', slot: '20:00' } }));
  assert.equal(res.status, 200);
  res = await admin.POST(req({ as: 'admin', body: { action: 'assign', day: 1, buff: 'construction', member_id: 'member-a', slot: '05:00' } }));
  assert.equal(res.status, 409);
  assert.equal((await admin.POST(req({ as: 'admin', body: { action: 'assign', day: 1, buff: 'construction', member_id: 'nobody', slot: '21:00' } }))).status, 404);
  await admin.POST(req({ as: 'admin', body: { action: 'auto_allocate' } }));
  const a = state.tables[COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS].find((r) => r.member_id === 'member-a');
  assert.equal(a.slot, '20:00');
  assert.equal(state.tables[COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS].filter((r) => r.member_id === 'member-a').length, 1);
  assert.equal((await admin.POST(req({ as: 'admin', body: { action: 'unassign', day: 1, buff: 'construction', member_id: 'member-a' } }))).status, 200);
  assert.equal(state.tables[COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS].some((r) => r.member_id === 'member-a'), false);
  assert.equal((await admin.POST(req({ as: 'admin', body: { action: 'nope' } }))).status, 400);
});

// ---- one form with all three buffs: POST { applications: [...], withdraw: [...] }
const hours = (h) => [h, `${String(Number(h.slice(0, 2)) + 1).padStart(2, '0')}:00`, `${String(Number(h.slice(0, 2)) + 2).padStart(2, '0')}:00`];
const one = (day, buff, extra = {}) => ({ day, buff, tg: 10, ttg: 1, speedup_days: 5, preferred_hours: hours('08:00'), ...extra });
const batch = (as, body) => member.POST(req({ as, body }));

test('batch: validated all-or-nothing, shared name copied, nothing saved on a bad item', async () => {
  const before = state.tables[COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS].length;
  const bad = await batch('a', { in_game_name: 'Ann', applications: [one(1, 'construction'), one(2, 'research', { preferred_hours: ['08:00'] })] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Day 2 Research/);
  assert.equal((await batch('a', { applications: [one(1, 'construction'), one(1, 'construction')] })).status, 400);
  assert.equal((await batch('a', { applications: [one(1, 'construction')], withdraw: [{ day: 1, buff: 'construction' }] })).status, 400);
  assert.equal((await batch('a', { applications: [] })).status, 400);
  assert.equal((await batch('a', { applications: [one(3, 'construction')] })).status, 400);
  assert.equal(state.tables[COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS].length, before, 'nothing was written');
  const ok = await batch('a', { in_game_name: 'Ann', applications: [one(1, 'construction'), one(2, 'research'), one(4, 'training')] });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.saved, 'Day 1 Construction, Day 2 Research, Day 4 Troop Training');
  const mine = state.tables[COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS].filter((r) => r.member_id === 'member-a');
  assert.equal(mine.length, 3);
  assert.ok(mine.every((r) => r.in_game_name === 'Ann'));
});

test('batch honours the closed gate and the old single body still works', async () => {
  state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'appointments', is_open: false }];
  assert.equal((await batch('a', { applications: [one(1, 'construction')] })).status, 403);
  state.tables[COLLECTIONS.FORM_GATES] = [];
  assert.equal((await apply('a', { tg: 321 })).status, 200);
  assert.equal(state.tables[COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS].find((r) => r.member_id === 'member-a' && r.day === 1).tg, 321);
});

test('batch withdraw removes the application and its assignment, leaving other members alone', async () => {
  const ASG = COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS;
  state.tables[ASG] = [
    { cycle_id: 'current', day: 2, buff: 'research', member_id: 'member-a', slot: '08:00' },
    { cycle_id: 'current', day: 2, buff: 'research', member_id: 'member-b', slot: '09:00' },
  ];
  await batch('b', { applications: [one(2, 'research')] });
  const res = await batch('a', { applications: [one(1, 'construction')], withdraw: [{ day: 2, buff: 'research' }, { day: 4, buff: 'training' }] });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).withdrawn, 'Day 2 Research, Day 4 Troop Training');
  const apps = state.tables[COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS];
  assert.deepEqual(apps.filter((r) => r.member_id === 'member-a').map((r) => r.day), [1]);
  assert.ok(apps.some((r) => r.member_id === 'member-b' && r.day === 2));
  assert.deepEqual(state.tables[ASG].map((r) => r.member_id), ['member-b']);
  assert.equal((await batch('a', { withdraw: [{ day: 7, buff: 'x' }] })).status, 400);
});

test('GET offers the previous cycle applications for prefill', async () => {
  const APPS = COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS;
  state.tables[APPS].push({ member_id: 'member-a', day: 4, buff: 'training', cycle_id: 'older', tg: 7, ttg: 0, speedup_days: 1, preferred_hours: hours('10:00'), in_game_name: 'Ann', updated_at: new Date('2026-01-01') });
  const got = await (await member.GET(req({ as: 'a' }))).json();
  assert.equal(got.applications.some((a) => a.day === 4), false, 'older cycle is not this cycle');
  const prev = got.previousApplications.find((a) => a.day === 4 && a.buff === 'training');
  assert.equal(prev.tg, 7);
  assert.equal(prev.in_game_name, 'Ann');
});
