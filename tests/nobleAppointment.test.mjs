import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__nobleTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:noble-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:noble-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|jsx|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:noble-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:noble-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__nobleTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'noble-test-only';
process.env.ADMIN_PASSWORD = 'noble-admin-only';
const sched = await import('../app/admin/dashboard/prepScheduler.mjs');
const noble = await import('../lib/nobleAppointment.mjs');
const results = await import('../lib/memberResults.mjs');
const forms = await import('../lib/memberForms.mjs');
const adminRoute = await import('../app/api/admin-noble-advisor/appointments/route.js');
const memberRoute = await import('../app/api/noble-appointment/route.js');
const control = await import('../app/api/admin-event-control/route.js');
const statusServer = await import('../lib/memberFormStatus.server.js');
const { NOBLE_TIME_SLOTS } = await import('../lib/nobleAdvisor.mjs');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');

const answer = (id, name, extra = {}) => ({
  id: `n-${id}`, member_id: id, in_game_name: name, want_troop_training: 'Yes', is_transfer: 'No', promoting_t11: 'Yes', troop_speedup_days: '10',
  avail_day4: ['02:00', '03:30', '14:00'], created_at: new Date('2026-10-08T10:00:00Z'), ...extra,
});
const ROWS = ['1', '2', '3', '4', '5'].map((n, i) => answer(`92000000${n}`, `P${n}`, { troop_speedup_days: String(10 + i) }));

// ---------------------------------------------------------------- pure bridge
test('noble bridge: one slot per member, only day 4, open spots skipped', () => {
  const result = sched.schedule(ROWS, { day4Slots: NOBLE_TIME_SLOTS });
  const placements = noble.schedulerResultToNoblePlacements(result);
  assert.equal(placements.length, 3); // three shared half-hours, five members
  assert.equal(new Set(placements.map((p) => p.member_id)).size, placements.length);
  assert.equal(new Set(placements.map((p) => p.slot)).size, placements.length);
  assert.deepEqual(noble.NOBLE_TYPE, { day: 4, buff: 'noble', label: 'Noble Advisor', role: 'Noble Advisor' });
  assert.deepEqual(noble.nobleFilter('abc'), { cycle_id: 'abc', day: 4, buff: 'noble' });
});

test('noble bridge: locked (hand placed) rows are preserved and not returned as automatic', () => {
  const stored = [{ day: 4, buff: 'noble', member_id: '920000005', slot: '14:00', name: 'P5', manual: true }, { day: 4, buff: 'noble', member_id: '920000001', slot: '02:00', name: 'P1', manual: false }];
  const locked = noble.lockedForNoble(stored);
  assert.deepEqual(locked, { 4: [{ member_id: '920000005', slot: '14:00', name: 'P5' }] });
  const result = sched.schedule(ROWS, { day4Slots: NOBLE_TIME_SLOTS, locked });
  const placements = noble.schedulerResultToNoblePlacements(result);
  assert.ok(!placements.some((p) => p.member_id === '920000005' || p.slot === '14:00'));
  const day4 = result.days.find((d) => d.day === 4).rows;
  assert.equal(day4.find((r) => r.time === '14:00').locked, true);
  assert.deepEqual(noble.lockedForNoble([]), {});
});

test('noble view: placed, not placed, waiting, not asked', () => {
  const rec = { want_troop_training: 'Yes' };
  const slot = { slot: '14:30' };
  assert.equal(noble.nobleMyView({ record: rec, assignment: slot, published: true, cycleStart: '2026-10-18' }).line, 'Oct 18, 14:30 UTC');
  assert.equal(noble.nobleMyView({ record: rec, assignment: slot, published: false }).status, 'waiting'); // unpublished hides the slot
  assert.equal(noble.nobleMyView({ record: rec, published: true }).status, 'not_placed');
  assert.equal(noble.nobleMyView({ record: { want_troop_training: 'No' }, published: true }).status, 'not_asked');
  assert.equal(noble.nobleMyView({ published: true }).saved, false);
});

test('noble grid shows names only and flags the viewer; unplaced has reasons', () => {
  const grid = noble.nobleGrid([{ slot: '02:00', name: 'P1', member_id: '920000001' }], '920000001');
  assert.equal(grid.length, 48);
  assert.deepEqual(grid[4], { slot: '02:00', range: '02:00–02:30', name: 'P1', mine: true });
  assert.equal(JSON.stringify(grid).includes('9200000'), false);
  const un = noble.unplacedNoble(ROWS, [{ member_id: '920000001', slot: '02:00' }, { member_id: '920000002', slot: '03:30' }, { member_id: '920000003', slot: '14:00' }]);
  assert.equal(un.length, 2);
  assert.match(un[0].reason, /No free slot/);
  assert.match(noble.nobleScheduleAsText([{ slot: '02:00', name: 'P1', member_id: '1' }], { cycleLabel: 'S1' }), /02:00–02:30 UTC {2}P1/);
  assert.equal(noble.nobleScheduleSheets([]).length, 1);
});

// ---------------------------------------------------------------- results rows
test('result rows: wording by state, never part of MEMBER_FORMS', () => {
  assert.ok(!forms.MEMBER_FORMS.some((f) => f.kind === 'result'));
  assert.equal(results.kvkResultRow({ prepSaved: false }).message, 'Fill in the KvK Prep & Appointments form first');
  assert.equal(results.kvkResultRow({ prepSaved: true, published: false }).message, 'Leadership has not published the schedule yet');
  const placed = results.kvkResultRow({ prepSaved: true, published: true, publishedAt: 'x', asked: true, cycleStart: '2026-10-20', assignments: [{ day: 1, buff: 'construction', slot: '14:30' }, { day: 5, buff: 'overflow', slot: '10:00' }, { day: 2, buff: 'research', slot: '01:00' }] });
  assert.equal(placed.state, 'placed');
  assert.equal(placed.ready, true);
  assert.deepEqual(placed.lines.slice(0, 2), ['Day 1 Construction: Oct 20, 14:30 UTC', 'Day 2 Research: Oct 21, 01:00 UTC']);
  assert.match(results.kvkResultRow({ prepSaved: true, published: true, asked: true }).message, /You were not placed/);
  assert.equal(results.nobleResultRow({ saved: true, asked: true, published: true, assignment: { slot: '14:30' }, cycleStart: '2026-10-18' }).lines[0], 'Oct 18, 14:30 UTC');
});

test('results sit under their form and never count as to do; new highlight clears once seen', () => {
  const list = [{ key: 'prep', needsInput: true }, { key: 'joiner', needsInput: true }, { key: 'dragon' }, { key: 'noble', needsInput: false }];
  const res = [results.NOBLE_RESULT, results.KVK_RESULT].map((r) => ({ ...r }));
  const out = results.withResults(list, res);
  assert.deepEqual(out.map((x) => x.key), ['prep', 'my-appointment', 'joiner', 'dragon', 'noble', 'my-noble-appointment']);
  assert.equal(results.todoCount(out), 2);
  const row = { key: 'my-appointment', publishedAt: '2026-10-08T00:00:00.000Z', ready: true };
  assert.equal(results.isResultNew(row, false), true);
  assert.equal(results.isResultNew(row, true), false);
  assert.equal(results.isResultNew({ ...row, ready: false }, false), false);
  assert.notEqual(results.resultSeenKey(row), results.resultSeenKey({ ...row, publishedAt: 'later' }));
  // orderMemberForms still works on forms only
  assert.equal(forms.orderMemberForms(forms.computeFormStatuses({ gates: {} }), {}).length, forms.MEMBER_FORMS.length);
});

// ---------------------------------------------------------------- routes
const adminToken = await mintAdminToken();
const tokens = {};
for (const id of ['920000001', '920000002', '920000003', '920000004', '920000005', '920000099']) tokens[id] = await createMemberToken(id);
const req = ({ body = {}, as = null, member = null, url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : member && k === 'k710_member_session' ? { value: tokens[member] } : undefined) },
});
const post = (body) => adminRoute.POST(req({ as: 'admin', body }));

test('admin noble pipeline: build, adjust (lock), publish; members see nothing until published', async () => {
  for (const k of Object.keys(state.tables)) delete state.tables[k];
  const created = await control.POST(req({ as: 'admin', body: { type: 'flamedragon', action: 'start_cycle', label: 'Flamedragon S9' } }));
  assert.equal(created.status, 200);
  const cycleId = (await created.json()).state.cycle.id;
  state.tables[COLLECTIONS.NOBLE_ADVISOR] = ROWS.map((r) => ({ ...r, event_cycle_id: cycleId }));
  const A = COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS;

  assert.equal((await adminRoute.POST(req({ body: { action: 'build_schedule' } }))).status, 401);
  assert.equal((await adminRoute.GET(req({}))).status, 401);
  const built = await (await post({ action: 'build_schedule' })).json();
  assert.equal(built.assigned, 3);
  assert.equal(built.unplaced.length, 2);
  const rows = state.tables[A];
  assert.ok(rows.every((a) => a.cycle_id === cycleId && a.day === 4 && a.buff === 'noble' && a.manual === false));
  assert.equal(new Set(rows.map((a) => a.member_id)).size, rows.length);

  // Hand-place P1 (not in the automatic result) on 03:00: locked, survives a rebuild, still one slot each.
  assert.equal((await post({ action: 'assign', member_id: '920000001', slot: '03:00' })).status, 200);
  assert.equal((await post({ action: 'assign', member_id: '920000002', slot: '03:00' })).status, 409);
  assert.equal((await post({ action: 'assign', member_id: 'nobody', slot: '04:00' })).status, 404);
  assert.equal((await post({ action: 'assign', member_id: '920000001', slot: '03:15' })).status, 400);
  await post({ action: 'build_schedule' });
  const p1 = state.tables[A].filter((a) => a.member_id === '920000001');
  assert.equal(p1.length, 1);
  assert.deepEqual([p1[0].slot, p1[0].manual], ['03:00', true]);
  assert.equal(new Set(state.tables[A].map((a) => a.slot)).size, state.tables[A].length);

  const view = await (await adminRoute.GET(req({ as: 'admin' }))).json();
  assert.equal(view.published, false);
  assert.equal(view.is_live, true);
  assert.equal(view.rows.length, 5);

  // Unpublished: no schedule, no slot for the member.
  const placedId = state.tables[A][0].member_id;
  const before = await (await memberRoute.GET(req({ member: placedId }))).json();
  assert.equal(before.published, false);
  assert.equal(before.schedule, null);
  assert.equal(before.mine, null);
  assert.equal(before.status, 'waiting');
  assert.equal(JSON.stringify(before).includes('P1'), false);

  assert.equal((await (await post({ action: 'publish', published: true })).json()).published, true);
  const after = await (await memberRoute.GET(req({ member: placedId }))).json();
  assert.equal(after.published, true);
  assert.equal(after.status, 'placed');
  assert.match(after.mine.line, /UTC$/);
  assert.equal(after.schedule.length, 48);
  assert.equal(after.schedule.filter((s) => s.mine).length, 1);
  assert.equal(JSON.stringify(after).includes('92000000'), false); // names and slots only, no member ids

  // Status API results: placed row highlighted-ready, not counted as a form.
  const sf = await statusServer.getMemberResults(placedId, [{ key: 'prep', submitted: true }]);
  const noblePlaced = sf.find((r) => r.key === 'my-noble-appointment');
  assert.equal(noblePlaced.state, 'placed');
  assert.equal(noblePlaced.ready, true);
  assert.equal(noblePlaced.kind, 'result');

  // A member whose answer exists but got no slot sees the plain "not placed" text; one with no answer is told to fill the form.
  const unplacedId = ROWS.map((r) => r.member_id).find((id) => !state.tables[A].some((a) => a.member_id === id));
  const np = await (await memberRoute.GET(req({ member: unplacedId }))).json();
  assert.equal(np.status, 'not_placed');
  assert.equal(np.mine, null);
  const none = await (await memberRoute.GET(req({ member: '920000099' }))).json();
  assert.equal(none.saved, false);
  assert.equal(none.status, 'not_asked');
  assert.equal((await memberRoute.GET(req({}))).status, 401);

  assert.equal((await post({ action: 'unassign', member_id: '920000001' })).status, 200);
  assert.ok(!state.tables[A].some((a) => a.member_id === '920000001'));
  assert.equal((await (await post({ action: 'publish', published: false })).json()).published, false);
  assert.equal((await (await memberRoute.GET(req({ member: placedId }))).json()).schedule, null);
});
