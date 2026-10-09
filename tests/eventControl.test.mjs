import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__eventControlTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ec-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:ec-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:ec-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:ec-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__eventControlTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'event-control-test-only';
process.env.ADMIN_PASSWORD = 'event-control-admin-only';
const control = await import('../app/api/admin-event-control/route.js');
const gatesRoute = await import('../app/api/admin-form-gates/route.js');
const apptRoute = await import('../app/api/kvk-appointments/route.js');
const prepRoute = await import('../app/api/prep-backpack/route.js');
const nobleRoute = await import('../app/api/noble-advisor/route.js');
const requestsRoute = await import('../app/api/website-requests/route.js');
const availRoute = await import('../app/api/kvk-availability/route.js');
const rosterRoute = await import('../app/api/admin-submissions/route.js');
const rallyRoute = await import('../app/api/admin-rallies/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const { gateClosedMessage } = await import('../lib/formGateWindow.mjs');
const { WINDOWED_GATE_KEYS, FORM_GATE_KEYS } = await import('../lib/formGates.mjs');

const adminToken = await mintAdminToken();
const memberToken = await createMemberToken('m1');
const req = ({ body = {}, as = null, url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const T = COLLECTIONS;
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; };
const post = async (body) => control.POST(req({ as: 'admin', body }));
const get = async (type) => (await control.GET(req({ as: 'admin', url: `http://x/api/admin-event-control?type=${type}` }))).json();
const HOUR = 3600e3;
const past = (h) => new Date(Date.now() - h * HOUR).toISOString();
const future = (h) => new Date(Date.now() + h * HOUR).toISOString();

const SIX = { infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG6', archer_tier: 'T11', archer_tg: 'TG7' }; // troop tier + TG are required on both member forms
test('gateClosedMessage is plain language and null when open', () => {
  assert.equal(gateClosedMessage({ is_open: true }), null);
  assert.match(gateClosedMessage({ is_open: true, closes_at: past(2) }), /^This form is closed\. It closed on .* UTC\.$/);
  assert.match(gateClosedMessage({ is_open: true, opens_at: future(5) }), /^This form is not open yet\. It opens on .* UTC\.$/);
  assert.equal(gateClosedMessage({ is_open: false }), 'This form is closed.');
  assert.equal(gateClosedMessage({ is_open: false, message: 'See you next KvK.' }), 'This form is closed. See you next KvK.');
});

test('every gate key accepts a window and cycle id through PATCH', async () => {
  assert.deepEqual(WINDOWED_GATE_KEYS, FORM_GATE_KEYS);
  reset();
  for (const key of ['appointments', 'lead', 'requests']) {
    const res = await gatesRoute.PATCH(req({ as: 'admin', body: { form_key: key, is_open: true, opens_at: past(1), closes_at: future(3), cycle_id: 'kvk-9' } }));
    assert.equal(res.status, 200, key);
    const { gate } = await res.json();
    assert.equal(gate.cycle_id, 'kvk-9');
    assert.ok(gate.closes_at && gate.opens_at);
  }
  const bad = await gatesRoute.PATCH(req({ as: 'admin', body: { form_key: 'prep', closes_at: past(5), opens_at: future(1) } }));
  assert.equal(bad.status, 400);
});

test('member submit routes close and open on their window', async () => {
  reset();
  const prepBody = { in_game_name: 'Ann' };
  const noble = { in_game_name: 'Ann' };
  // No window: open as before.
  assert.equal((await prepRoute.POST(req({ as: 'member', body: prepBody }))).status, 200);
  // Closed by window.
  state.tables[T.FORM_GATES] = [
    { form_key: 'prep', is_open: true, closes_at: new Date(past(1)) },
    { form_key: 'noble', is_open: true, opens_at: new Date(future(4)) },
    { form_key: 'requests', is_open: true, closes_at: new Date(past(1)) },
    { form_key: 'appointments', is_open: true, closes_at: new Date(past(1)) },
    { form_key: 'joiner', is_open: true, closes_at: new Date(past(1)) },
  ];
  let res = await prepRoute.POST(req({ as: 'member', body: prepBody }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /This form is closed\. It closed on/);
  res = await nobleRoute.POST(req({ as: 'member', body: noble }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /not open yet\. It opens on/);
  assert.equal((await requestsRoute.POST(req({ as: 'member', body: { current_alliance: '710', section: 'Forms', message: 'hi' } }))).status, 403);
  assert.equal((await availRoute.POST(req({ as: 'member', body: { member_id: 'm1', name: 'A', current_alliance: '710', availability: 'Not Available', ...SIX } }))).status, 403);
  res = await apptRoute.POST(req({ as: 'member', body: { day: 1, buff: 'construction', tg: 1, ttg: 0, speedup_days: 0, preferred_hours: ['05:00', '06:00', '07:00'] } }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /This form is closed/);
  // Window reopens: a future closes_at lets submissions through.
  state.tables[T.FORM_GATES].find((g) => g.form_key === 'prep').closes_at = new Date(future(2));
  assert.equal((await prepRoute.POST(req({ as: 'member', body: prepBody }))).status, 200);
});

test('control API needs an admin and validates input', async () => {
  reset();
  assert.equal((await control.GET(req({ url: 'http://x/api?type=kvk' }))).status, 401);
  assert.equal((await control.POST(req({ body: { type: 'kvk', action: 'close_forms' } }))).status, 401);
  assert.equal((await control.GET(req({ as: 'admin', url: 'http://x/api?type=nope' }))).status, 400);
  assert.equal((await post({ type: 'kvk', action: 'nope' })).status, 400);
  assert.equal((await post({ type: 'kvk', action: 'start_cycle', label: '' })).status, 400);
  assert.equal((await post({ type: 'kvk', action: 'start_cycle', label: 'X', opens_at: future(5), closes_at: past(1) })).status, 400);
  assert.equal((await post({ type: 'kvk', action: 'archive_reset' })).status, 400);
  assert.equal((await post({ type: 'flamedragon', action: 'publish' })).status, 400);
  assert.equal((await post({ type: 'flamedragon', action: 'close_forms', form_key: 'lead' })).status, 400);
  const bad = await control.POST({ url: 'http://x', json: async () => { throw new Error('bad'); }, cookies: req({ as: 'admin' }).cookies });
  assert.equal(bad.status, 400);
});

test('GET shape for a fresh kvk and flamedragon cycle', async () => {
  reset();
  const kvk = await get('kvk');
  assert.equal(kvk.title, 'KvK');
  assert.equal(kvk.cycle.label, 'First cycle');
  assert.equal(kvk.cycle.status, 'collecting');
  assert.deepEqual(kvk.forms.map((f) => f.form_key), ['lead', 'joiner', 'prep']); // KvK Appointments is no longer a separate member form
  assert.deepEqual(kvk.forms.map((f) => f.label), ['Power Profile', 'KvK Availability', 'KvK Prep & Appointments']);
  assert.ok(kvk.forms.every((f) => f.state === 'open' && f.is_open));
  assert.deepEqual(kvk.appointments, { published: false, cycle_id: 'current', prep_answers: 0, slots_booked: 0, people_booked: 0 });
  assert.equal(kvk.next_actions[0], 'close_forms');
  assert.deepEqual(kvk.counts, { applicants: 0, assigned: 0, unassigned: 0, forms_open: 3, forms_total: 3, forms_submitted: { joiner: 0, prep: 0 } });
  const fd = await get('flamedragon');
  assert.equal(fd.title, 'Flamedragon Tyrant');
  assert.equal(fd.appointments, null);
  assert.deepEqual(fd.forms.map((f) => f.label), ['Flamedragon Tyrant form', 'Noble Advisor schedule']);
  assert.ok(!fd.next_actions.includes('publish'));
});

test('start_cycle moves gates to the new cycle, keeps the old one as history, resets publish', async () => {
  reset();
  await get('kvk');
  state.tables[T.SUBMISSIONS] = [
    { member_id: 'm1', name: 'Ann', pin_hash: 'secret', event_cycle_id: (await get('kvk')).cycle.id, event_cycle_label: 'First cycle' },
    { member_id: 'm2', name: 'Bob', event_cycle_id: (await get('kvk')).cycle.id },
  ];
  const first = (await get('kvk')).cycle;
  state.tables[T.KVK_APPOINTMENT_CYCLES] = [{ cycle_id: 'current', published: true }];
  assert.equal((await get('kvk')).cycle.status, 'published');
  const res = await post({ type: 'kvk', action: 'start_cycle', label: 'KvK 12', opens_at: past(1), closes_at: future(48) });
  assert.equal(res.status, 200);
  const { ok, state: s } = await res.json();
  assert.equal(ok, true);
  assert.equal(s.cycle.label, 'KvK 12');
  assert.notEqual(s.cycle.id, first.id);
  assert.equal(s.cycle.status, 'collecting');
  assert.ok(s.forms.every((f) => f.state === 'open' && f.closes_at));
  assert.equal(s.appointments.cycle_id, s.cycle.id);
  assert.equal(s.appointments.published, false);
  assert.deepEqual(s.history.map((h) => [h.label, h.archived, h.applicants]), [['First cycle', true, 2]]);
  // History survives: snapshots exist and never contain the pin hash.
  const snaps = state.tables[T.EVENT_CYCLE_SNAPSHOTS];
  assert.equal(snaps.length, 2);
  assert.ok(snaps.every((x) => x.event_type === 'kvk' && x.event_cycle_id === first.id && !('pin_hash' in x.payload)));
  // Submissions are never deleted.
  assert.equal(state.tables[T.SUBMISSIONS].length, 2);
  // Gate rows carry the new cycle id.
  assert.ok(state.tables[T.FORM_GATES].every((g) => g.cycle_id === s.cycle.id));
});

test('close_forms, open_forms and set_window', async () => {
  reset();
  await get('flamedragon');
  let s = (await (await post({ type: 'flamedragon', action: 'close_forms' })).json()).state;
  assert.equal(s.cycle.status, 'closed');
  assert.ok(s.forms.every((f) => f.state === 'closed'));
  assert.equal(s.next_actions[0], 'start_cycle');
  assert.equal(s.next_actions.at(-1), 'archive_reset', 'ending without a new cycle is never the first suggestion');
  s = (await (await post({ type: 'flamedragon', action: 'open_forms', form_key: 'noble' })).json()).state;
  assert.deepEqual(s.forms.map((f) => f.is_open), [false, true]);
  assert.equal(s.cycle.status, 'collecting');
  s = (await (await post({ type: 'flamedragon', action: 'set_window', form_key: 'dragon', opens_at: future(24), closes_at: future(48), message: 'Soon' })).json()).state;
  const dragon = s.forms.find((f) => f.form_key === 'dragon');
  assert.equal(dragon.message, 'Soon');
  assert.equal(dragon.is_open, false);
  // dragon is still closed by the earlier close_forms, so scheduling alone does not open it
  assert.equal(dragon.state, 'closed');
  s = (await (await post({ type: 'flamedragon', action: 'open_forms', form_key: 'dragon' })).json()).state;
  assert.equal(s.forms.find((f) => f.form_key === 'dragon').state, 'open'); // not-yet-started window cleared
  assert.equal((await post({ type: 'flamedragon', action: 'set_window', form_key: 'noble', opens_at: future(9), closes_at: future(2) })).status, 400);
  s = (await (await post({ type: 'flamedragon', action: 'set_window', form_key: 'noble', opens_at: null, closes_at: past(1) })).json()).state;
  assert.equal(s.forms.find((f) => f.form_key === 'noble').state, 'closed');
  s = (await (await post({ type: 'flamedragon', action: 'open_forms', form_key: 'noble' })).json()).state;
  assert.equal(s.forms.find((f) => f.form_key === 'noble').closes_at, null);
});

test('publish and unpublish act on the appointments cycle', async () => {
  reset();
  await get('kvk');
  let s = (await (await post({ type: 'kvk', action: 'publish' })).json()).state;
  assert.equal(s.appointments.published, true);
  assert.equal(s.cycle.status, 'published');
  assert.equal(s.next_actions.includes('unpublish'), true);
  s = (await (await post({ type: 'kvk', action: 'unpublish' })).json()).state;
  assert.equal(s.appointments.published, false);
  s = (await (await post({ type: 'kvk', action: 'unpublish' })).json()).state; // idempotent
  assert.equal(s.appointments.published, false);
});

test('archive_reset snapshots, ends the cycle, closes forms and keeps data', async () => {
  reset();
  const cycle = (await get('flamedragon')).cycle;
  state.tables[T.FLAMEDRAGON_FORMS] = [{ member_id: 'f1', name: 'Fay', event_cycle_id: cycle.id }];
  state.tables[T.FLAMEDRAGON_ADMIN_RALLIES] = [{ id: 'r1', member_ids: ['f1'], position: 0 }];
  const s1 = await get('flamedragon');
  assert.deepEqual(s1.counts, { applicants: 1, assigned: 1, unassigned: 0, forms_open: 2, forms_total: 2, forms_submitted: { dragon: 1, noble: 0 } });
  assert.equal((await post({ type: 'flamedragon', action: 'archive_reset', confirm: false })).status, 400);
  const res = await post({ type: 'flamedragon', action: 'archive_reset', confirm: true });
  assert.equal(res.status, 200);
  const { state: s } = await res.json();
  assert.equal(s.cycle, null);
  assert.deepEqual(s.next_actions, ['start_cycle']);
  assert.ok(s.forms.every((f) => f.state === 'ended' && !f.is_open));
  assert.deepEqual(s.history.map((h) => [h.id, h.archived, h.applicants]), [[cycle.id, true, 1]]);
  assert.equal(state.tables[T.EVENT_CYCLE_SNAPSHOTS].length, 1);
  assert.equal(state.tables[T.FLAMEDRAGON_FORMS].length, 1);
  // Legacy untagged rally rows were pinned to the archived cycle.
  assert.equal(state.tables[T.FLAMEDRAGON_ADMIN_RALLIES][0].event_cycle_id, cycle.id);
  assert.equal((await post({ type: 'flamedragon', action: 'archive_reset', confirm: true })).status, 400);
  // A new cycle starts with an empty planner and open forms.
  const next = (await (await post({ type: 'flamedragon', action: 'start_cycle', label: 'Tyrant 2' })).json()).state;
  assert.equal(next.counts.assigned, 0);
  assert.equal(next.cycle.status, 'collecting');
});

test('resubmitting in a new cycle snapshots the old row first; cycle=<id> reads history', async () => {
  reset();
  const first = (await get('kvk')).cycle;
  state.tables[T.SUBMISSIONS] = [{ member_id: 'm1', name: 'Ann', pin_hash: 'x', availability: 'Full battle (12-17 UTC)', event_cycle_id: first.id, event_cycle_label: first.label }];
  const second = (await (await post({ type: 'kvk', action: 'start_cycle', label: 'KvK 2', close_previous: false })).json()).state.cycle;
  state.tables[T.EVENT_CYCLE_SNAPSHOTS] = []; // prove the overwrite path snapshots on its own
  const res = await availRoute.POST(req({ as: 'member', body: { member_id: 'm1', name: 'Ann', current_alliance: '710', availability: 'Not Available', ...SIX } }));
  assert.equal(res.status, 200);
  const snaps = state.tables[T.EVENT_CYCLE_SNAPSHOTS];
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].event_cycle_id, first.id);
  assert.equal(snaps[0].payload.availability, 'Full battle (12-17 UTC)');
  assert.equal(snaps[0].payload.pin_hash, undefined);
  assert.equal(state.tables[T.SUBMISSIONS][0].event_cycle_id, second.id);
  const old = await (await rosterRoute.GET(req({ as: 'admin', url: `http://x/api/admin-submissions?cycle=${first.id}` }))).json();
  assert.deepEqual(old.rows.map((r) => [r.member_id, r.availability]), [['m1', 'Full battle (12-17 UTC)']]);
  const cur = await (await rosterRoute.GET(req({ as: 'admin', url: `http://x/api/admin-submissions?cycle=${second.id}` }))).json();
  assert.equal(cur.rows[0].availability, 'Not Available');
  const unknown = await rosterRoute.GET(req({ as: 'admin', url: 'http://x/api/admin-submissions?cycle=64b000000000000000000000' }));
  assert.equal(unknown.status, 404);
  // The old no-param call still returns the live roster.
  const live = await (await rosterRoute.GET(req({ as: 'admin' }))).json();
  assert.equal(live.rows.length, 1);
  // Re-saving again in the same cycle does not add another snapshot.
  await availRoute.POST(req({ as: 'member', body: { member_id: 'm1', name: 'Ann', current_alliance: '710', availability: 'Not Available', ...SIX } }));
  assert.equal(state.tables[T.EVENT_CYCLE_SNAPSHOTS].length, 1);
});

test('rally planner is scoped to the current cycle', async () => {
  reset();
  const first = (await get('kvk')).cycle;
  const rally = (id) => ({ id, name: id, memberIds: ['m1'], leadMemberId: 'm1', troopWeights: {}, leadHeroes: {}, leadHeroAssignments: {} });
  state.tables[T.ADMIN_RALLIES] = [{ id: 'legacy', name: 'Legacy', position: 0, member_ids: ['m9'] }];
  let list = await (await rallyRoute.GET(req({ as: 'admin' }))).json();
  assert.deepEqual(list.rallies.map((r) => r.id), ['legacy']); // untagged rows count as current
  await rallyRoute.PUT(req({ as: 'admin', body: { rallies: [rally('a')] } }));
  assert.deepEqual(state.tables[T.ADMIN_RALLIES].map((r) => [r.id, r.event_cycle_id]), [['a', first.id]]);
  const second = (await (await post({ type: 'kvk', action: 'start_cycle', label: 'KvK 2' })).json()).state.cycle;
  list = await (await rallyRoute.GET(req({ as: 'admin' }))).json();
  assert.deepEqual(list.rallies, []); // new cycle starts clean
  await rallyRoute.PUT(req({ as: 'admin', body: { rallies: [rally('b')] } }));
  const rows = state.tables[T.ADMIN_RALLIES];
  assert.deepEqual(rows.map((r) => [r.id, r.event_cycle_id]).sort(), [['a', first.id], ['b', second.id]]); // old cycle kept
  list = await (await rallyRoute.GET(req({ as: 'admin' }))).json();
  assert.deepEqual(list.rallies.map((r) => r.id), ['b']);
});
