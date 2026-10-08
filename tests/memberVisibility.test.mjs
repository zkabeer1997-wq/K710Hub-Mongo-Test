import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { computeFormStatuses, orderMemberForms, stillNeedsSummary, firstIncomplete } from '../lib/memberForms.mjs';
import {
  visibleMemberItems, resultPagesVisible, withResults, todoCount, kvkResultRow, nobleResultRow,
  NOTHING_OPEN_MESSAGE, resultUnavailableMessage,
} from '../lib/memberResults.mjs';
import { buildDeadlineEntries } from '../lib/deadlines.mjs';
import { closeFormsWarning, publishFormClosedWarning, visibilityStatusLine, resultKindForEvent } from '../lib/resultVisibility.mjs';
import { createMemberToken } from '../lib/memberAuth.js';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const H = 3600e3;
const iso = (ms) => new Date(ms).toISOString();
const keys = (list) => list.map((f) => f.key);
const open = { is_open: true };
const closed = { is_open: false };
const votesOpen = { swordland: { is_open: true, opens_at: iso(NOW - H), closes_at: iso(NOW + 24 * H) }, 'tri-alliance': { is_open: true, opens_at: iso(NOW - H), closes_at: iso(NOW + 24 * H) } };
const results = () => [kvkResultRow({ prepSaved: true }), nobleResultRow({ saved: true })];
const statuses = (gates) => computeFormStatuses({ gates, now: NOW });

test('all open: every form and both results are listed', () => {
  const v = visibleMemberItems(statuses({ ...votesOpen }), results());
  assert.deepEqual(keys(v.forms), ['lead', 'joiner', 'prep', 'dragon', 'noble', 'swordland', 'tri-alliance']);
  assert.deepEqual(keys(v.results), ['my-appointment', 'my-noble-appointment']);
  assert.equal(v.hidden, 0);
});

test('closed and upcoming forms disappear (no Closed rows)', () => {
  const gates = { lead: closed, joiner: open, prep: open, dragon: closed, noble: open, swordland: { is_open: true, opens_at: iso(NOW + 48 * H) }, 'tri-alliance': votesOpen['tri-alliance'] };
  const v = visibleMemberItems(statuses(gates), results());
  assert.deepEqual(keys(v.forms).sort(), ['joiner', 'noble', 'prep', 'tri-alliance']);
  assert.ok(v.forms.every((f) => f.state === 'open'));
  assert.equal(v.hidden, 3);
});

test('an event vote with no window is not listed (upcoming), a windowed one is', () => {
  const v = visibleMemberItems(statuses({ swordland: open, 'tri-alliance': votesOpen['tri-alliance'] }));
  assert.ok(!keys(v.forms).includes('swordland'));
  assert.ok(keys(v.forms).includes('tri-alliance'));
});

test('KvK Prep and My appointment go together', () => {
  const closedPrep = visibleMemberItems(statuses({ prep: closed, ...votesOpen }), results());
  assert.ok(!keys(closedPrep.forms).includes('prep'));
  assert.ok(!keys(closedPrep.results).includes('my-appointment'));
  assert.ok(keys(closedPrep.results).includes('my-noble-appointment')); // noble still open
  const openPrep = visibleMemberItems(statuses({ prep: open, ...votesOpen }), results());
  assert.ok(keys(openPrep.results).includes('my-appointment'));
});

test('Noble Advisor and My Noble Advisor appointment go together', () => {
  const v = visibleMemberItems(statuses({ noble: closed, ...votesOpen }), results());
  assert.ok(!keys(v.forms).includes('noble'));
  assert.deepEqual(keys(v.results), ['my-appointment']);
  assert.equal(withResults(v.forms, v.results).filter((x) => x.kind === 'result').length, 1);
});

test('a result with an unknown owner is hidden; nothing open gives zero items and a message', () => {
  const gates = Object.fromEntries(['lead', 'joiner', 'prep', 'dragon', 'noble'].map((k) => [k, closed]));
  const v = visibleMemberItems(statuses(gates), results());
  assert.deepEqual([v.forms.length, v.results.length], [0, 0]);
  assert.equal(v.hidden, 9);
  assert.match(NOTHING_OPEN_MESSAGE, /nothing to fill in right now/);
  assert.equal(todoCount(v.forms), 0);
  assert.equal(stillNeedsSummary(v.forms), null);
  assert.equal(firstIncomplete(v.forms), null);
});

test('to-do count and ordering only involve visible forms', () => {
  const ordered = orderMemberForms(statuses({ joiner: closed, prep: open, ...votesOpen }), {}, NOW);
  const v = visibleMemberItems(ordered, results());
  assert.equal(todoCount(v.forms), v.forms.filter((f) => f.needsInput).length);
  assert.ok(!keys(v.forms).includes('joiner'));
  assert.equal(visibleMemberItems(v.forms, v.results).hidden, 0); // idempotent
});

test('deadline entries keep upcoming openings as information', () => {
  const forms = statuses({ prep: { is_open: true, opens_at: iso(NOW + 48 * H) }, ...votesOpen });
  const entries = buildDeadlineEntries({ forms }, NOW);
  assert.ok(entries.some((e) => e.kind === 'opens' && e.formKey === 'prep'));
});

test('resultPagesVisible follows the owning gate', () => {
  assert.deepEqual(resultPagesVisible({ prep: open, noble: open }, NOW), { kvk: true, noble: true });
  assert.deepEqual(resultPagesVisible({ prep: closed, noble: open }, NOW), { kvk: false, noble: true });
  assert.deepEqual(resultPagesVisible({ prep: open, noble: { is_open: true, closes_at: iso(NOW - H) } }, NOW), { kvk: true, noble: false });
  assert.deepEqual(resultPagesVisible({}, NOW), { kvk: true, noble: true });
  assert.match(resultUnavailableMessage('kvk'), /not available right now.*KvK Prep & Appointments form is open/);
});

test('admin warning helpers', () => {
  assert.equal(resultKindForEvent('kvk'), 'kvk');
  assert.equal(resultKindForEvent('flamedragon'), 'noble');
  assert.match(closeFormsWarning('kvk', { published: true }), /no longer see My appointment while this form is closed\. Keep the form open/);
  assert.match(closeFormsWarning('noble', { published: true, formKey: 'noble' }), /My Noble Advisor appointment/);
  assert.equal(closeFormsWarning('kvk', { published: false }), null);
  assert.equal(closeFormsWarning('kvk', { published: true, formKey: 'joiner' }), null);
  assert.equal(closeFormsWarning('kvk', { published: true, formOpen: false }), null);
  assert.equal(publishFormClosedWarning('kvk', false), 'The form is closed, so members cannot see My appointment. Open the form so they can.');
  assert.equal(publishFormClosedWarning('kvk', true), null);
  assert.equal(publishFormClosedWarning('kvk', null), null);
  assert.equal(visibilityStatusLine('kvk', true), 'Members can see My appointment: Yes (form open)');
  assert.equal(visibilityStatusLine('kvk', false), 'Members can see My appointment: No (form closed)');
});

// ---- API visibility: closed owning form -> no slots, no schedule
const state = { tables: {} };
globalThis.__memberVisTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:mv-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(adminAuth|memberAuth|mongoCollections|eventCycles\.server|formGates\.server|memberFormStatus\.server)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:mv-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__memberVisTest.tables);` };
    }
    return next(u, c);
  },
});
process.env.MEMBER_SESSION_SECRET = 'member-vis-test-only';
const kvkRoute = await import('../app/api/kvk-appointments/route.js');
const kvkSchedule = await import('../app/api/kvk-appointments/schedule/route.js');
const nobleRoute = await import('../app/api/noble-appointment/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const token = await createMemberToken('member-a');
const req = () => ({ url: 'http://x/api', json: async () => ({}), cookies: { get: (k) => (k === 'k710_member_session' ? { value: token } : undefined) } });

test('kvk member GET routes return nothing while the Prep form is closed', async () => {
  state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'prep', is_open: false }];
  state.tables[COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS] = [{ member_id: 'member-a', cycle_id: 'current', day: 1, buff: 'construction', slot: '05:00', name: 'A' }];
  state.tables[COLLECTIONS.KVK_APPOINTMENT_CYCLES] = [{ cycle_id: 'current', published: true }];
  const mine = await (await kvkRoute.GET(req())).json();
  assert.equal(mine.unavailable, true);
  assert.deepEqual(mine.assignments, []);
  assert.equal(JSON.stringify(mine).includes('05:00'), false);
  const sched = await (await kvkSchedule.GET(req())).json();
  assert.deepEqual([sched.unavailable, sched.published, sched.days], [true, false, []]);
});

test('kvk member GET routes return the slot again once the Prep form is open', async () => {
  state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'prep', is_open: true }];
  const mine = await (await kvkRoute.GET(req())).json();
  assert.equal(mine.unavailable, undefined);
  assert.deepEqual(mine.assignments, [{ day: 1, buff: 'construction', slot: '05:00' }]);
  const sched = await (await kvkSchedule.GET(req())).json();
  assert.equal(sched.published, true);
});

test('noble member GET returns no schedule while the Noble Advisor form is closed', async () => {
  state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'noble', is_open: false }];
  const body = await (await nobleRoute.GET(req())).json();
  assert.equal(body.unavailable, true);
  assert.equal(body.mine, null);
  assert.equal(body.schedule, null);
});
