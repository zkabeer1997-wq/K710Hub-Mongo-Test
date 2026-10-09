import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__kvkFlowTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:flow-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:flow-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|jsx|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:flow-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:flow-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__kvkFlowTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'kvk-flow-test-only';
process.env.ADMIN_PASSWORD = 'kvk-flow-admin-only';
const sched = await import('../app/admin/dashboard/prepScheduler.mjs');
const bridge = await import('../lib/kvkScheduleBridge.mjs');
const appt = await import('../lib/kvkAppointments.mjs');
const { KVK_FORM_KEYS, FORM_GATE_LABELS, FORM_GATE_KEYS } = await import('../lib/formGates.mjs');
const admin = await import('../app/api/admin-kvk-appointments/route.js');
const control = await import('../app/api/admin-event-control/route.js');
const memberRoute = await import('../app/api/kvk-appointments/route.js');
const scheduleRoute = await import('../app/api/kvk-appointments/schedule/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');

const golden = JSON.parse(readFileSync(new URL('./fixtures/prepScheduleGolden.json', import.meta.url), 'utf8'));
const taken = (result) => result.days.map((d) => ({ day: d.day, rows: d.rows.filter((r) => r.member_id).map((r) => [r.time, r.member]) }));

test('MAX_SLOTS_PER_DAY is 1 (owner decision)', () => {
  assert.equal(sched.MAX_SLOTS_PER_DAY, 1);
});

test('golden: same ranking and placement as the old scheduler when nobody had extra Day 4 slots', () => {
  assert.deepEqual(taken(sched.schedule(golden.rows)), golden.legacyLow);
});

test('golden: a huge speedup stockpile no longer buys extra slots, everything else stays as before', () => {
  const rows = golden.rows.map((r) => (r.member_id === '920000006' ? { ...r, troop_speedup_days: '1500' } : r));
  const now = taken(sched.schedule(rows));
  // Old output gave P6 three Day 4 slots (20:30, 23:00, 23:30). Now only the first, ranking is untouched.
  const expected = golden.legacyHighSpeedup.map((d) => {
    if (d.day !== 4) return d;
    const seen = new Set();
    return { day: 4, rows: d.rows.filter(([, name]) => (seen.has(name) ? false : (seen.add(name), true))) };
  });
  assert.deepEqual(now, expected);
});

test('never more than one slot per member per day, on every day including Day 5', () => {
  const many = golden.rows.map((r) => ({ ...r, want_construction: 'Yes', want_research: 'Yes', want_troop_training: 'Yes', troop_speedup_days: '5000',
    avail_day1: ['00:00', '00:30', '01:00'], avail_day2: ['02:00', '02:30', '03:00'], avail_day4: ['04:00', '04:30', '05:00'], avail_day5: ['06:00', '06:30', '07:00'] }));
  const out = sched.schedule(many);
  for (const d of out.days) {
    const ids = d.rows.filter((r) => r.member_id).map((r) => r.member_id);
    assert.equal(new Set(ids).size, ids.length, `Day ${d.day} repeats a member`);
  }
  assert.equal(out.days.find((d) => d.day === 4).rows.filter((r) => r.member_id).length, 3); // 3 free half-hours, 10 members: one each
});

test('duplicate answers from one member cannot book twice', () => {
  const dup = [...golden.rows.slice(5, 7), { ...golden.rows[5], id: 'dup' }];
  const out = sched.schedule(dup);
  const ids = out.days.find((d) => d.day === 4).rows.filter((r) => r.member_id).map((r) => r.member_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('rankByDay keeps the Prep Ministers rules (TG tier, T11, transfer then promotion)', () => {
  const r = sched.rankByDay(golden.rows);
  assert.deepEqual(r[1].slice(0, 3), ['920000001', '920000003', '920000002']); // TG8 x2, TG8, TG7
  assert.equal(r[2][0], '920000004'); // new T11 first
  assert.deepEqual(r[4].slice(0, 2), ['920000010', '920000006']); // transfer + promoting before transfer only
});

test('locked placements keep their slot and are not offered again', () => {
  const out = sched.schedule(golden.rows, { locked: { 1: [{ member_id: '920000002', slot: '00:00' }] } });
  const day1 = out.days.find((d) => d.day === 1).rows.filter((r) => r.member_id);
  assert.deepEqual(day1.find((r) => r.time === '00:00'), { time: '00:00', member: 'P2', member_id: '920000002', multi: false, locked: true });
  assert.equal(day1.filter((r) => r.member_id === '920000002').length, 1);
  assert.equal(day1.find((r) => r.time === '00:30').member, 'P1');
});

test('unplaced members come with a plain reason', () => {
  const out = sched.schedule(golden.rows);
  const p8 = out.unplaced.find((u) => u.member_id === '920000008');
  assert.equal(p8.day, 4);
  assert.match(p8.reason, /No free slot/);
});

test('bridge maps scheduler days to buffs and skips locked rows', () => {
  const out = bridge.schedulerResultToPlacements(sched.schedule(golden.rows, { locked: { 1: [{ member_id: '920000002', slot: '00:00' }] } }));
  assert.deepEqual(out.map((d) => [d.day, d.buff]), [[1, 'construction'], [2, 'research'], [4, 'training'], [5, 'overflow']]);
  assert.ok(!out[0].placements.some((p) => p.member_id === '920000002'));
});

test('text export lists booked slots by day in UTC with a time-zone note', () => {
  const text = bridge.scheduleAsText([
    { day: 1, buff: 'construction', slot: '00:00', name: 'P1', member_id: '1' },
    { day: 5, buff: 'overflow', slot: '11:00', name: 'P3', member_id: '3' },
  ], { cycleLabel: 'KvK Season 9' });
  assert.match(text, /KvK Season 9/);
  assert.match(text, /UTC \(game time\)/);
  assert.match(text, /Day 1 Construction \(Chief Minister\)/);
  assert.match(text, /00:00–00:30 UTC  P1/);
  assert.match(text, /Day 5 Overflow/);
  assert.ok(!/Day 2 Research/.test(text));
});

test('KvK attached forms: Availability and Prep & Appointments only (Power Profile is a standing form)', () => {
  assert.deepEqual(KVK_FORM_KEYS, ['joiner', 'prep']);
  assert.equal(FORM_GATE_LABELS.prep, 'KvK Prep & Appointments');
  assert.ok(FORM_GATE_KEYS.includes('appointments')); // still readable for old data
});

// ------------------------------------------------------------------ routes
const adminToken = await mintAdminToken();
const memberToken = await createMemberToken('920000003');
const req = ({ body = {}, as = null, url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const post = (body) => admin.POST(req({ as: 'admin', body }));

async function startCycle() {
  const res = await control.POST(req({ as: 'admin', body: { type: 'kvk', action: 'start_cycle', label: 'KvK Season 9' } }));
  assert.equal(res.status, 200);
  return (await res.json()).state.cycle.id;
}

test('build_schedule saves auto assignments with the right day / buff / slot; locked rows survive; publish reaches members', async () => {
  for (const k of Object.keys(state.tables)) delete state.tables[k];
  const cycleId = await startCycle();
  state.tables[COLLECTIONS.PREP_BACKPACK] = golden.rows.map((r) => ({ ...r, event_cycle_id: cycleId }));
  const A = COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS;

  assert.equal((await admin.POST(req({ body: { action: 'build_schedule' } }))).status, 401);
  const built = await (await post({ action: 'build_schedule' })).json();
  assert.equal(built.ok, true);
  const rows = state.tables[A];
  const find = (day, member) => rows.find((a) => a.day === day && a.member_id === member);
  assert.deepEqual([find(1, '920000001').buff, find(1, '920000001').slot, find(1, '920000001').manual], ['construction', '00:00', false]);
  assert.deepEqual([find(2, '920000004').buff, find(2, '920000004').slot], ['research', '01:00']);
  assert.deepEqual([find(4, '920000010').buff, find(4, '920000010').slot], ['training', '20:00']);
  assert.deepEqual([find(5, '920000003').buff, find(5, '920000003').slot], ['overflow', '11:00']); // Day 5 overflow
  assert.ok(rows.every((a) => a.cycle_id === cycleId));
  const perDay = new Set(rows.map((a) => `${a.day}:${a.member_id}`));
  assert.equal(perDay.size, rows.length); // one slot per member per day
  assert.ok(built.unplaced.some((u) => u.member_id === '920000008' && u.day === 4));

  // Admin GET carries the ranks per day and unplaced reasons.
  const view = await (await admin.GET(req({ as: 'admin' }))).json();
  assert.equal(view.prep_rows.find((r) => r.member_id === '920000001').ranks['1'], 1);
  assert.ok(view.unplaced.length >= 1);

  // Hand-place P8 on Day 4 (locks), and move P1 to a free slot: a rebuild must keep both.
  assert.equal((await post({ action: 'assign', day: 4, buff: 'training', member_id: '920000008', slot: '21:30' })).status, 200);
  assert.equal(find(4, '920000008').manual, true);
  assert.equal((await post({ action: 'assign', day: 1, buff: 'construction', member_id: '920000001', slot: '05:00' })).status, 200);
  assert.equal((await post({ action: 'assign', day: 5, buff: 'overflow', member_id: '920000005', slot: '11:30' })).status, 200);
  await post({ action: 'build_schedule' });
  assert.equal(find(4, '920000008').slot, '21:30');
  assert.equal(find(1, '920000001').slot, '05:00');
  assert.equal(find(1, '920000001').manual, true);
  assert.equal(rows.filter((a) => a.day === 1 && a.member_id === '920000001').length, 1);
  assert.equal(find(5, '920000005').slot, '11:30');
  assert.equal(new Set(rows.map((a) => `${a.day}:${a.slot}`)).size, rows.length); // no double booking

  // Unpublished: members see nothing. Published: schedule + "mine" show it.
  assert.deepEqual(await (await scheduleRoute.GET(req({ as: 'member' }))).json(), { published: false, days: [] });
  assert.deepEqual((await (await memberRoute.GET(req({ as: 'member' }))).json()).assignments, []);
  const pub = await post({ action: 'publish', published: true });
  assert.equal((await pub.json()).published, true);
  const sch = await (await scheduleRoute.GET(req({ as: 'member' }))).json();
  assert.equal(sch.published, true);
  assert.ok(sch.days.find((d) => d.day === 1).slots.find((s) => s.slot === '00:00' || s.slot === '05:00'));
  const mine = (await (await memberRoute.GET(req({ as: 'member' }))).json()).assignments;
  assert.ok(mine.some((a) => a.day === 5 && a.buff === 'overflow' && a.slot === '11:00'));
  assert.equal(JSON.stringify(sch).includes('920000'), false); // names only, no member ids

  // Unassign works for the Day 5 overflow type too.
  assert.equal((await post({ action: 'unassign', day: 5, buff: 'overflow', member_id: '920000005' })).status, 200);
  assert.ok(!state.tables[A].some((a) => a.day === 5 && a.member_id === '920000005'));
  // Unknown member / unknown day.
  assert.equal((await post({ action: 'assign', day: 1, buff: 'construction', member_id: 'nobody', slot: '01:00' })).status, 404);
  assert.equal((await post({ action: 'assign', day: 3, buff: 'construction', member_id: '920000001', slot: '01:00' })).status, 400);
});

test('publish confirmation counts come from the saved schedule', async () => {
  const state1 = await (await control.GET(req({ as: 'admin', url: 'http://x/api?type=kvk' }))).json();
  assert.ok(state1.appointments.slots_booked > 0);
  assert.ok(state1.appointments.people_booked > 0);
  assert.equal(state1.appointments.prep_answers, golden.rows.length);
  assert.deepEqual(state1.forms.map((f) => f.form_key), ['joiner', 'prep']);
  assert.equal(state1.counts.forms_total, 2);
});

test('old admin addresses redirect to the KvK / Flamedragon event tabs', async () => {
  for (const [path, dest] of [
    ['../app/admin/dashboard/prep-ministers/page.js', '/admin/dashboard/events/kvk?tab=appointments'],
    ['../app/admin/dashboard/kvk-appointments/page.js', '/admin/dashboard/events/kvk?tab=appointments'],
    ['../app/admin/dashboard/noble-advisor/page.js', '/admin/dashboard/events/flamedragon?tab=noble'],
  ]) {
    const mod = await import(path);
    let caught = null;
    try { mod.default(); } catch (e) { caught = e; }
    assert.ok(caught, `${path} should redirect`);
    assert.match(String(caught.digest || ''), /^NEXT_REDIRECT/);
    assert.ok(String(caught.digest).includes(dest), `${path} -> ${dest}, got ${caught.digest}`);
  }
});

test('KvK event page has one Appointments tab and no Prep ministers tab', () => {
  const src = readFileSync(new URL('../components/admin/EventControl.jsx', import.meta.url), 'utf8');
  const kvk = src.slice(src.indexOf('kvk: {'), src.indexOf('flamedragon: {'));
  assert.ok(kvk.includes("{ id: 'appointments', label: 'Appointments' }"));
  assert.ok(!kvk.includes("id: 'prep'"));
  assert.ok(!/Prep ministers/.test(kvk));
});

test('Day 5 overflow shows in the member schedule grid and in My appointments rows', () => {
  const asg = [{ day: 5, buff: 'overflow', slot: '11:00', name: 'P3' }];
  const grid = appt.buildSchedule(asg);
  assert.equal(grid.length, 4);
  assert.equal(grid[3].filled, 1);
  assert.equal(appt.buildSchedule([]).length, 3);
  const mineRows = appt.myAppointmentRows({ applications: [], assignments: asg, published: true });
  assert.equal(mineRows.length, 4);
  assert.equal(mineRows[3].text, 'Day 5 Overflow: Assigned 11:00–11:30');
});
