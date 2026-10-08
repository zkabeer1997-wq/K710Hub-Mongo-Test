import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__memberFixesTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:mf-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(adminAuth|memberAuth|mongoCollections|eventCycles\.server|memberAuthKingshot|kingshotLoginAudit|rateLimit|interestUploadLimits|transferIntakePeriods\.server)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:mf-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__memberFixesTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'member-fixes-test-only';
const availability = await import('../app/api/kvk-availability/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const { withAppointmentsSummary } = await import('../lib/memberForms.mjs');
const token = await createMemberToken('920000777');
const req = (body) => ({
  url: 'http://x/api/kvk-availability',
  json: async () => body,
  headers: new Headers(),
  cookies: { get: (k) => (k === 'k710_member_session' ? { value: token } : undefined) },
});

test('KvK availability: first save creates the roster row instead of 404', async () => {
  const res = await availability.POST(req({ name: 'New Member', member_id: '920000777', current_alliance: '710', availability: 'Full battle (12-17 UTC)' }));
  assert.equal(res.status, 200);
  const rows = state.tables[COLLECTIONS.SUBMISSIONS] || [];
  const row = rows.find((r) => r.member_id === '920000777');
  assert.ok(row, 'row created');
  assert.equal(row.name, 'New Member');
  assert.equal(row.availability, 'Full battle (12-17 UTC)');
  // a second save updates the same row
  const again = await availability.POST(req({ name: 'New Member', member_id: '920000777', current_alliance: 'RED', availability: 'Not Available' }));
  assert.equal(again.status, 200);
  assert.equal(rows.filter((r) => r.member_id === '920000777').length, 1);
  assert.equal(rows.find((r) => r.member_id === '920000777').current_alliance, 'RED');
});

test('KvK availability: a spoofed member_id is ignored; the row is saved for the session id', async () => {
  const res = await availability.POST(req({ name: 'X', member_id: '123456789', current_alliance: '710', availability: 'Not Available' }));
  assert.equal(res.status, 200);
  const rows = state.tables[COLLECTIONS.SUBMISSIONS] || [];
  assert.equal(rows.some((r) => r.member_id === '123456789'), false);
  assert.equal(rows.find((r) => r.member_id === '920000777').name, 'X');
});

test('withAppointmentsSummary adds the published lines to the Prep entry only', () => {
  const base = [{ key: 'prep', submitted: true }, { key: 'joiner', submitted: true }];
  const out = withAppointmentsSummary(base, ['Day 1 Construction: Oct 21, 14:30 UTC']);
  assert.deepEqual(out[0].appointmentsSummary, ['Day 1 Construction: Oct 21, 14:30 UTC']);
  assert.equal(out[1].appointmentsSummary, undefined);
  assert.equal(withAppointmentsSummary(base, [])[0].appointmentsSummary, undefined);
});

const interest = await import('../app/api/interest/route.js');
const formReq = (entries) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return { url: 'http://x/api/interest', headers: new Headers({ 'x-forwarded-for': '203.0.113.' + Math.floor(Math.random() * 250) }), formData: async () => fd };
};

test('interest: a fast fill WITHOUT the honeypot is never silently dropped', async () => {
  const res = await interest.POST(formReq([['rendered_at', String(Date.now() - 500)], ['in_game_name', 'Fast Filler']]));
  // It reaches real validation (no screenshot -> 400), not a fake ok:true.
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /screenshot/i);
});

test('interest: a filled honeypot is still treated as a bot', async () => {
  const res = await interest.POST(formReq([['website', 'http://spam.example'], ['rendered_at', String(Date.now() - 60000)]]));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal((state.tables[COLLECTIONS.INTEREST_SUBMISSIONS] || []).length, 0);
});
