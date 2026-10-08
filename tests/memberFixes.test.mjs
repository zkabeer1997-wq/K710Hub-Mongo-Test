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
const { withAppointmentProgress } = await import('../lib/memberForms.mjs');
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

test('KvK availability: cannot save for another member id', async () => {
  const res = await availability.POST(req({ name: 'X', member_id: '123456789', current_alliance: '710', availability: 'Not Available' }));
  assert.equal(res.status, 403);
});

test('withAppointmentProgress marks 1 of 3 as partial and 3 of 3 as complete', () => {
  const base = [{ key: 'appointments', submitted: true }, { key: 'prep', submitted: true }];
  const one = withAppointmentProgress(base, 1, 3);
  assert.deepEqual([one[0].appliedCount, one[0].appliedTotal, one[0].partial], [1, 3, true]);
  assert.equal(one[1].partial, undefined);
  assert.equal(withAppointmentProgress(base, 3, 3)[0].partial, false);
  assert.equal(withAppointmentProgress(base, 0, 3)[0].partial, false);
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
