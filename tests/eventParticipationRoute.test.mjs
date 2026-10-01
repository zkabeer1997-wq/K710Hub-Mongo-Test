import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__epTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ep-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(memberAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:ep-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__epTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'ep-test-only';
const route = await import('../app/api/event-participation/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const token = await createMemberToken('member-a');
const cookies = (signedIn) => ({ get: (k) => (signedIn && k === 'k710_member_session' ? { value: token } : undefined) });
const get = (qs, signedIn = true) => ({ url: `http://x/api/event-participation${qs}`, cookies: cookies(signedIn) });
const post = (body, signedIn = true) => ({ cookies: cookies(signedIn), json: async () => body });

const H = 3600e3;
const setGate = (gate) => { state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'swordland', ...gate }]; };
const openGate = () => setGate({ is_open: true, opens_at: new Date(Date.now() - H), closes_at: new Date(Date.now() + H), cycle_id: 'c1' });

test('requires a member session', async () => {
  assert.equal((await route.GET(get('?form=swordland-showdown', false))).status, 401);
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'absent', power: 1 }, false))).status, 401);
});

test('unknown form is a 404', async () => {
  assert.equal((await route.GET(get('?form=nope'))).status, 404);
  assert.equal((await route.POST(post({ form: 'nope', vote: 'absent', power: 1 }))).status, 404);
});

test('server enforces the window: not open yet, closed, admin-closed', async () => {
  setGate({ is_open: true, opens_at: new Date(Date.now() + H), closes_at: null });
  let res = await route.POST(post({ form: 'swordland-showdown', vote: 'flexible', power: 100 }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /isn't open yet\. Opens/);
  setGate({ is_open: true, opens_at: new Date(Date.now() - 2 * H), closes_at: new Date(Date.now() - H) });
  res = await route.POST(post({ form: 'swordland-showdown', vote: 'flexible', power: 100 }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'Closed');
  setGate({ is_open: false, opens_at: new Date(Date.now() - H), closes_at: null });
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'flexible', power: 100 }))).status, 403);
  setGate({ is_open: true });
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'flexible', power: 100 }))).status, 403);
  assert.equal(state.tables[COLLECTIONS.EVENT_PARTICIPATION]?.length || 0, 0);
});

test('validation errors are 400 and nothing is stored', async () => {
  openGate();
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'maybe', power: 100 }))).status, 400);
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'absent', power: 'lots' }))).status, 400);
  assert.equal(state.tables[COLLECTIONS.EVENT_PARTICIPATION]?.length || 0, 0);
});

test('saving twice updates one row (upsert), and GET returns the entry', async () => {
  openGate();
  let res = await route.GET(get('?form=swordland-showdown'));
  let body = await res.json();
  assert.equal(body.entry, null);
  assert.equal(body.window.state, 'open');
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'legion_time', power: '1,000' }))).status, 200);
  assert.equal((await route.POST(post({ form: 'swordland-showdown', vote: 'absent', power: 2000 }))).status, 200);
  const rows = state.tables[COLLECTIONS.EVENT_PARTICIPATION];
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].member_id, rows[0].form_id, rows[0].cycle_id, rows[0].vote, rows[0].power], ['member-a', 'swordland-showdown', 'c1', 'absent', 2000]);
  body = await (await route.GET(get('?form=swordland-showdown'))).json();
  assert.equal(body.entry.vote, 'absent');
  assert.ok(body.entry.updated_at);
});

test('a new cycle id starts a fresh entry', async () => {
  setGate({ is_open: true, opens_at: new Date(Date.now() - H), closes_at: null, cycle_id: 'c2' });
  assert.equal((await (await route.GET(get('?form=swordland-showdown'))).json()).entry, null);
  await route.POST(post({ form: 'swordland-showdown', vote: 'flexible', power: 5 }));
  assert.equal(state.tables[COLLECTIONS.EVENT_PARTICIPATION].length, 2);
});

test('the unique (member_id, form_id, cycle_id) index is registered', async () => {
  const { INDEXES } = await import('../lib/mongoCollections.js');
  const idx = INDEXES.event_participation.find((i) => i.options.unique);
  assert.deepEqual(Object.keys(idx.keys), ['member_id', 'form_id', 'cycle_id']);
  for (const name of ['prep_backpack', 'noble_advisor_submissions']) {
    assert.ok(INDEXES[name].some((i) => i.options.unique && i.keys.member_id === 1), name);
  }
});
