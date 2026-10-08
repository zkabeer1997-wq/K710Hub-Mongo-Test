import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { tables: {} };
globalThis.__interestApiTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ia-mongo', shortCircuit: true };
    if (s === 'next/server') return next(s + '.js', c);
    if (/\/(mongoCollections|rateLimit|interestUploadLimits|transferIntakePeriods\.server)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:ia-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__interestApiTest.tables);` };
    }
    return next(u, c);
  },
});

const interest = await import('../app/api/interest/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
state.tables[COLLECTIONS.TRANSFER_INTAKE_PERIODS] = [{ _id: 'p1', label: 'Test window', is_active: true }];

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let ip = 10;
function req(overrides = {}, { extra = [] } = {}) {
  const fd = new FormData();
  const base = {
    in_game_name: 'API Test', player_id: '123456', discord_username: 'apitest', current_server: '512', current_alliance: 'None',
    migrate_alliance: '710 (Bear 0200UTC and 1300UTC)', highest_troop_level: 'TG8', current_tg: '5,000', mystic_trial_stages: '120',
    total_power: '245,000,000', active_commit: 'Yes', willing_save_resources: 'Yes', participates_battles: 'Yes',
    spending_archetype: 'F2P (pure skills, always on)', main_language: 'English', rendered_at: String(Date.now() - 60000),
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) if (v !== null) fd.append(k, v);
  fd.append('t11_units', 'No T11');
  fd.append('screenshots', new File([PNG], 'a.png', { type: 'image/png' }));
  for (const [k, v] of extra) fd.append(k, v);
  return { url: 'http://x/api/interest', headers: new Headers({ 'x-forwarded-for': `198.51.100.${ip++}` }), formData: async () => fd };
}
const rows = () => state.tables[COLLECTIONS.INTEREST_SUBMISSIONS] || [];

test('old payload (no client_request_id, comma numbers, optional fields absent) still stores as before', async () => {
  const res = await interest.POST(req());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reference, /^K710-[0-9A-F]{8}$/);
  const row = rows().at(-1);
  assert.equal(row.total_power, '245000000');
  assert.equal(row.current_tg, '5000');
  assert.equal(row.willing_reduce_power, '');
  assert.equal(row.status, 'pending');
  assert.equal(row.client_request_id, undefined);
});

test('new formats are accepted and stored as digits; discord @ is stripped', async () => {
  const res = await interest.POST(req({ total_power: '12.3M', discord_username: '  @QaUser ' }));
  assert.equal(res.status, 200);
  const row = rows().at(-1);
  assert.equal(row.total_power, '12300000');
  assert.equal(row.discord_username, 'QaUser');
});

test('letters in a numeric field are still rejected', async () => {
  const res = await interest.POST(req({ total_power: 'lots' }));
  assert.equal(res.status, 400);
});

test('retry with the same client_request_id returns the same reference and stores one row', async () => {
  const before = rows().length;
  const a = await (await interest.POST(req({}, { extra: [['client_request_id', 'req-abc-1']] }))).json();
  const b = await (await interest.POST(req({}, { extra: [['client_request_id', 'req-abc-1']] }))).json();
  assert.equal(a.reference, b.reference);
  assert.equal(rows().length, before + 1);
});
