import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__oneFormTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:of-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:of-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:of-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:of-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__oneFormTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'one-form-test-only';
process.env.ADMIN_PASSWORD = 'one-form-admin-only';
const apptRoute = await import('../app/api/kvk-appointments/route.js');
const prepRoute = await import('../app/api/prep-backpack/route.js');
const statusRoute = await import('../app/api/member-form-status/route.js');
const cycles = await import('../lib/eventCycles.server.js');
const { COLLECTIONS: T } = await import('../lib/mongoCollections.js');
const { computeFormStatuses } = await import('../lib/memberForms.mjs');

const memberToken = await createMemberToken('m1');
const req = ({ body = {}, as = 'member', url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; cycles.resetCycleBackfillCache(); };
const statuses = async () => Object.fromEntries((await (await statusRoute.GET(req())).json()).forms.map((f) => [f.key, f]));
const PREP = { in_game_name: 'Ann', want_construction: 'Yes', want_research: 'No', want_troop_training: 'Yes', avail_day1: ['12:00', '12:30'], avail_day4: ['00:00'] };
const { MEMBER_FORMS, CYCLE_FORM_ORDER, orderMemberForms } = await import('../lib/memberForms.mjs');
const { myAppointmentView, appointmentLine, prepDayDate, slotInstant } = await import('../lib/myAppointment.mjs');
const { readFileSync } = await import('node:fs');

test('registry: one KvK Prep & Appointments form, no separate appointments form anywhere', () => {
  assert.equal(MEMBER_FORMS.some((f) => f.key === 'appointments'), false);
  const prep = MEMBER_FORMS.find((f) => f.key === 'prep');
  assert.equal(prep.label, 'KvK Prep & Appointments');
  assert.equal(prep.shortLabel, 'KvK Prep & Appointments');
  assert.equal(prep.gateKey, 'prep');
  assert.deepEqual(CYCLE_FORM_ORDER.kvk, ['prep', 'joiner']);
  const ordered = orderMemberForms(MEMBER_FORMS.map((f) => ({ ...f, state: 'open', submitted: false })), { kvk: { status: 'collecting' } }, Date.now());
  assert.deepEqual(ordered.slice(0, 2).map((f) => f.key), ['prep', 'joiner']);
});

test('prep API keeps its payload; status API has no appointments key and a Done prep entry', async () => {
  reset();
  const res = await prepRoute.POST(req({ body: PREP }));
  assert.equal(res.status, 200);
  const row = state.tables[T.PREP_BACKPACK][0];
  for (const k of ['want_construction', 'want_research', 'want_troop_training', 'avail_day1', 'avail_day2', 'avail_day4', 'avail_day5', 'construction_upgrades', 't11_troops', 'notes']) assert.ok(k in row, k);
  const s = await statuses();
  assert.equal(s.appointments, undefined);
  assert.equal(s.prep.submitted, true);
  assert.equal(s.prep.label, 'KvK Prep & Appointments');
  assert.equal(s.prep.appointmentsSummary, undefined, 'nothing published yet');
});

test('status API adds appointmentsSummary once the schedule is published and the member is placed', async () => {
  reset();
  await prepRoute.POST(req({ body: PREP }));
  const cycle = await cycles.getCurrentEventCycle('kvk');
  state.tables[T.EVENT_CYCLES].find((c) => String(c._id) === String(cycle.id)).start_date = '2026-10-20';
  state.tables[T.KVK_APPOINTMENT_ASSIGNMENTS] = [
    { cycle_id: 'current', day: 1, buff: 'construction', slot: '14:30', member_id: 'm1', name: 'Ann' },
    { cycle_id: 'current', day: 1, buff: 'construction', slot: '15:00', member_id: 'other', name: 'Bob' },
  ];
  assert.equal((await statuses()).prep.appointmentsSummary, undefined, 'not published: hidden');
  state.tables[T.KVK_APPOINTMENT_CYCLES] = [{ cycle_id: 'current', published: true, published_at: new Date() }];
  const s = await statuses();
  assert.deepEqual(s.prep.appointmentsSummary, ['Day 1 Construction: Oct 20, 14:30 UTC']);
  const mine = await (await apptRoute.GET(req())).json();
  assert.equal(mine.published, true);
  assert.deepEqual(mine.assignments.map((a) => a.slot), ['14:30']);
  assert.equal(mine.prep.saved, true);
  assert.equal(mine.prep.want_construction, 'Yes');
  assert.equal(mine.prep.avail_counts[1], 2);
});

test('myAppointmentView: placed, waiting, not placed and not asked read as plain states', () => {
  const prep = { want_construction: 'Yes', want_research: 'Yes', want_troop_training: 'No' };
  const before = myAppointmentView({ prep, assignments: [], published: false, cycleStart: '2026-10-20' });
  assert.deepEqual(before.map((r) => r.status), ['waiting', 'waiting', 'not_asked']);
  const after = myAppointmentView({ prep, assignments: [{ day: 1, buff: 'construction', slot: '14:30' }], published: true, cycleStart: '2026-10-20' });
  assert.deepEqual(after.map((r) => r.status), ['placed', 'not_placed', 'not_asked']);
  assert.equal(after[0].line, 'Day 1 Construction: Oct 20, 14:30 UTC');
  assert.equal(myAppointmentView({ prep: { saved: false }, assignments: [], published: true })[0].status, 'not_asked');
});

test('prep day dates: day 1 is the cycle start, later days add whole days; no start means no date', () => {
  assert.equal(prepDayDate('2026-10-20', 4).toISOString(), '2026-10-23T00:00:00.000Z');
  assert.equal(prepDayDate(null, 1), null);
  assert.equal(slotInstant('2026-10-20', 2, '09:30').toISOString(), '2026-10-21T09:30:00.000Z');
  assert.equal(appointmentLine({ day: 4, buff: 'training', slot: '00:00' }, null), 'Day 4 Troop Training: 00:00 UTC');
});

test('appointment page: only My appointment and Schedule tabs; ?tab=apply redirects to the Prep form', () => {
  // JSX/server components cannot load in plain node:test, so check the source contract (browser run covers behaviour).
  const tabs = readFileSync(new URL('../components/member/kvk-appointments/Tabs.jsx', import.meta.url), 'utf8');
  assert.match(tabs, /id: 'mine'/);
  assert.match(tabs, /id: 'schedule'/);
  assert.doesNotMatch(tabs, /id: 'apply'/);
  const page = readFileSync(new URL('../app/forms/kvk-appointments/page.js', import.meta.url), 'utf8');
  assert.match(page, /raw === 'apply'\) redirect\('\/prep-phase-backpack'\)/);
});
