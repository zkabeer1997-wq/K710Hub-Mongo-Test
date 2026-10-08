import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__ppTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:pp-mongo', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(memberAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:pp-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__ppTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'pp-test-only';
const route = await import('../app/api/power-profile/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const token = await createMemberToken('member-a');
const req = (qs, signedIn) => ({
  url: `http://x/api/power-profile${qs}`,
  cookies: { get: (k) => (signedIn && k === 'k710_member_session' ? { value: token } : undefined) },
});

state.tables[COLLECTIONS.POWER_PROFILES] = [
  { member_id: 'member-a', name: 'A', pet_power: '1' },
  { member_id: 'member-b', name: 'B', pet_power: '2' },
];

test('anonymous visitors cannot read any profile', async () => {
  const res = await route.GET(req('?member_id=member-b', false));
  assert.equal(res.status, 401);
});

test("a ?member_id= for someone else is ignored: members only ever get their own profile", async () => {
  const res = await route.GET(req('?member_id=member-b', true));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.profile.name, 'A');
  assert.equal(body.profile.member_id, 'member-a');
});

test('members can prefill their own profile', async () => {
  const res = await route.GET(req('?member_id=member-a', true));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).profile.name, 'A');
});
