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
    spending_archetype: 'F2P (pure skills, always on)', main_language: 'English', willing_reduce_power: 'No', passes_required: '0', current_passes: '0', rendered_at: String(Date.now() - 60000),
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) if (v !== null) fd.append(k, v);
  fd.append('t11_units', 'No T11');
  fd.append('screenshots', new File([PNG], 'a.png', { type: 'image/png' }));
  for (const [k, v] of extra) fd.append(k, v);
  return { url: 'http://x/api/interest', headers: new Headers({ 'x-forwarded-for': `198.51.100.${ip++}` }), formData: async () => fd };
}
const rows = () => state.tables[COLLECTIONS.INTEREST_SUBMISSIONS] || [];

test('old payload (no client_request_id, comma numbers, all fields present) still stores as before', async () => {
  const res = await interest.POST(req());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reference, /^K710-[0-9A-F]{8}$/);
  const row = rows().at(-1);
  assert.equal(row.total_power, '245000000');
  assert.equal(row.current_tg, '5000');
  assert.equal(row.willing_reduce_power, 'No');
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

const REQUIRED = ['in_game_name', 'player_id', 'discord_username', 'current_server', 'current_alliance', 'migrate_alliance',
  'highest_troop_level', 'current_tg', 'mystic_trial_stages', 'total_power', 'willing_reduce_power', 'passes_required',
  'current_passes', 'active_commit', 'willing_save_resources', 'participates_battles', 'spending_archetype', 'main_language'];

for (const field of REQUIRED) {
  test(`missing ${field} returns 400 naming the field`, async () => {
    const before = rows().length;
    const res = await interest.POST(req({ [field]: null }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.field, field);
    assert.match(body.error, /Missing required answer/);
    const blank = await interest.POST(req({ [field]: '   ' }));
    assert.equal(blank.status, 400);
    assert.equal(rows().length, before);
  });
}

test('missing T11 selection returns 400', async () => {
  const fd = req().formData;
  const r = req();
  const data = await r.formData();
  data.delete('t11_units');
  const res = await interest.POST({ ...r, formData: async () => data });
  assert.equal(res.status, 400);
  void fd;
});

test('zero is accepted for TG, passes and Mystic Trial stages', async () => {
  const res = await interest.POST(req({ current_tg: '0', passes_required: '0', current_passes: '0', mystic_trial_stages: '0' }));
  assert.equal(res.status, 200);
  assert.equal(rows().at(-1).mystic_trial_stages, '0');
});

test('total power limits: 3,000,000,000 and 3b ok; 3,000,000,001, 3.1b, 0 and a 30-digit paste rejected', async () => {
  for (const ok of ['3000000000', '3,000,000,000', '3b', '3B']) {
    const res = await interest.POST(req({ total_power: ok }));
    assert.equal(res.status, 200, ok);
    assert.equal(rows().at(-1).total_power, '3000000000');
  }
  for (const bad of ['3000000001', '3,000,000,001', '3.1b', '3.1B', '1'.repeat(30), '0']) {
    const res = await interest.POST(req({ total_power: bad }));
    assert.equal(res.status, 400, bad);
    const body = await res.json();
    assert.equal(body.field, 'total_power');
    if (bad !== '0') assert.equal(body.error, 'Total power cannot be more than 3,000,000,000. Check the number and try again.');
    else assert.match(body.error, /more than 0/);
  }
});

test('Mystic Trial limits: 4000 ok, 4001 rejected, k suffix not thousands', async () => {
  assert.equal((await interest.POST(req({ mystic_trial_stages: '4000' }))).status, 200);
  assert.equal(rows().at(-1).mystic_trial_stages, '4000');
  const over = await interest.POST(req({ mystic_trial_stages: '4001' }));
  assert.equal(over.status, 400);
  assert.equal((await over.json()).error, 'Mystic Trial stages cannot be more than 4,000.');
  assert.equal((await interest.POST(req({ mystic_trial_stages: '4k' }))).status, 400);
  assert.equal((await interest.POST(req({ mystic_trial_stages: '99999999999999999999' }))).status, 400);
});

test('absurd TG and pass counts are rejected', async () => {
  assert.equal((await interest.POST(req({ current_tg: '10000000001' }))).status, 400);
  assert.equal((await interest.POST(req({ passes_required: '100001' }))).status, 400);
  assert.equal((await interest.POST(req({ current_passes: 'lots' }))).status, 400);
});
