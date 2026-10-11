import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__ppMystic = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ppm-mongo', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(memberAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:ppm-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__ppMystic.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'pp-mystic-test-only';
const route = await import('../app/api/power-profile/route.js');
const toolRoute = await import('../app/api/member-power-profile/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const token = await createMemberToken('m1');
const req = (body) => ({
  url: 'http://x/api/power-profile',
  json: async () => body,
  cookies: { get: (k) => (k === 'k710_member_session' ? { value: token } : undefined) },
});
const profile = () => state.tables[COLLECTIONS.POWER_PROFILES].find((p) => p.member_id === 'm1');
const reset = ({ login, saved } = {}) => {
  state.tables[COLLECTIONS.POWER_PROFILES] = saved === undefined ? [] : [{ member_id: 'm1', name: 'Ann', mystic_trial_score: saved, updated_at: new Date('2026-01-01') }];
  state.tables[COLLECTIONS.KINGSHOT_USERS] = login === undefined ? [] : [{ player_id: 'm1', kingdom_id: 710, mystic_trial: login }];
};
const BODY = { name: 'Ann', pet_power: '1.5M', masters_power: '2,250,000' };

test('POST saves Pet / Masters Power as plain digits', async () => {
  reset();
  const res = await route.POST(req(BODY));
  assert.equal(res.status, 200);
  assert.equal(profile().pet_power, '1500000');
  assert.equal(profile().masters_power, '2250000');
  assert.equal((await res.json()).profile.pet_power, '1500000');
});

test('POST can clear a number and leaves it optional', async () => {
  reset();
  await route.POST(req(BODY));
  const res = await route.POST(req({ name: 'Ann', pet_power: '', masters_power: '' }));
  assert.equal(res.status, 200);
  assert.equal(profile().pet_power, null);
  assert.equal(profile().masters_power, null);
});

test('POST rejects a bad number with a field-specific message and saves nothing', async () => {
  reset();
  const res = await route.POST(req({ name: 'Ann', pet_power: 'lots' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.field, 'pet_power');
  assert.match(body.error, /^Pet Power: /);
  assert.equal(profile(), undefined);
  const big = await route.POST(req({ name: 'Ann', masters_power: '5,000,000,000' }));
  assert.equal(big.status, 400);
  assert.equal((await big.json()).field, 'masters_power');
});

test('Mystic Trial: the sign-in value is saved and a typed value in the body is ignored', async () => {
  reset({ login: 48250 });
  const res = await route.POST(req({ ...BODY, mystic_trial_score: '1' }));
  assert.equal(res.status, 200);
  assert.equal(profile().mystic_trial_score, '48250');
  assert.deepEqual((await res.json()).mystic, { value: '48250', source: 'login' });
});

test('Mystic Trial: an older typed value that differs from the sign-in value is replaced by the sign-in value', async () => {
  reset({ login: 48250, saved: '1234' });
  await route.POST(req(BODY));
  assert.equal(profile().mystic_trial_score, '48250');
});

test('Mystic Trial: with no sign-in value the previously saved one is kept (and a typed one still ignored)', async () => {
  reset({ saved: '1234' });
  const res = await route.POST(req({ ...BODY, mystic_trial_score: '9999' }));
  assert.equal(res.status, 200);
  assert.equal(profile().mystic_trial_score, '1234');
  assert.equal((await res.json()).mystic.source, 'saved');
  reset({ login: null, saved: '1234' });
  await route.POST(req(BODY));
  assert.equal(profile().mystic_trial_score, '1234', 'a null sign-in value counts as not available');
});

test('Mystic Trial: nothing known anywhere saves nothing and reports not available', async () => {
  reset();
  const res = await route.POST(req(BODY));
  assert.equal(profile().mystic_trial_score, null);
  assert.deepEqual((await res.json()).mystic, { value: '', source: 'none' });
});

test('GET returns the effective Mystic Trial even before a profile is saved, and the sign-in value beats the saved one', async () => {
  reset({ login: 777 });
  const fresh = await (await route.GET(req())).json();
  assert.equal(fresh.profile, null);
  assert.deepEqual(fresh.mystic, { value: '777', source: 'login' });
  reset({ login: 777, saved: '5' });
  const body = await (await route.GET(req())).json();
  assert.deepEqual(body.mystic, { value: '777', source: 'login' });
});

test('tools endpoint shows the same Mystic Trial value as the review', async () => {
  reset({ login: 777, saved: '5' });
  const body = await (await toolRoute.GET(req())).json();
  assert.equal(body.profile.mystic_trial_score, '777');
});
