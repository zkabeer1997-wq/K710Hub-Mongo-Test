import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { registerHooks } from 'node:module';
import { fakeFetch, fixture } from './helpers/externalFakes.mjs';
import { mintAdminToken } from '../lib/adminAuth.js';

const state = { tables: {} };
globalThis.__giftTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:gift-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(adminAuth|mongoCollections|memberAuth)$/.test(s)) return next(`${s}.js`, c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:gift-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__giftTest.tables, {external_snapshots:['_id'], gift_codes:['code']});` };
    }
    return next(u, c);
  },
});

const disc = await import('../lib/giftCodeDiscovery.mjs');
const cron = await import('../app/api/cron/gift-codes/route.js');
const adminRoute = await import('../app/api/admin-gift-codes/route.js');
const { resetRobotsCache } = await import('../lib/external/http.mjs');

const NET = 'https://kingshot.net/gift-codes';
const MAST = 'https://kingshotmastery.com/gift-codes';
const NOW = Date.parse('2026-10-08T18:00:00Z');
const page = (body) => ({ status: 200, headers: { get: () => null }, text: async () => body });
const status = (code) => ({ status: code, headers: { get: () => null }, text: async () => 'no' });
const BOTH = { GIFT_ENABLE_KINGSHOTMASTERY: '1' };
const active = () => state.tables.gift_codes.filter((c) => c.active !== false).map((c) => c.code).sort();

beforeEach(() => {
  for (const k of Object.keys(state.tables)) delete state.tables[k]; // the fake Mongo holds this same object
  resetRobotsCache();
});

test('kingshot.net alone: new codes inserted with source, sources, source_seen_at; field names kept', async () => {
  const f = fakeFetch({ overrides: { [NET]: page(fixture('giftcodes-kingshot-net.html')) } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW });
  assert.equal(r.new_codes, 3);
  assert.deepEqual(active(), ['Kingshot888', 'VIP777', 'WELLDONE']);
  const doc = state.tables.gift_codes.find((c) => c.code === 'WELLDONE');
  assert.equal(doc.source, 'kingshot.net');
  assert.deepEqual(doc.sources, ['kingshot.net']);
  assert.ok(doc.source_seen_at instanceof Date && doc.discovered_at instanceof Date && doc.created_at instanceof Date);
  assert.equal(doc.expires_at.toISOString(), '2026-10-10T23:59:00.000Z');
  assert.ok(!f.calls.some((c) => c.url.startsWith('https://kingshotmastery.com')), 'secondary is not contacted unless enabled');
  const ua = f.calls.find((c) => c.url === NET).headers['User-Agent'];
  assert.match(ua, /^K710Hub-KingdomSite\/1\.0 \(\+https?:\/\//);
});

test('both sources work: union by code, both recorded, expiry from the source that has it', async () => {
  const f = fakeFetch({ overrides: { [NET]: page(fixture('giftcodes-kingshot-net.html')), [MAST]: page(fixture('giftcodes-kingshotmastery.html')) } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: BOTH, now: NOW });
  assert.equal(r.total_listed, 3);
  const k = state.tables.gift_codes.find((c) => c.code === 'Kingshot888');
  assert.deepEqual(k.sources, ['kingshot.net', 'kingshotmastery.com']);
  assert.match(k.rewards, /200 Gems/);
});

test('primary blocked (403): secondary still used, nothing expired; blocked source is not retried, not even when forced', async () => {
  const f = fakeFetch({ overrides: { [NET]: status(403), [MAST]: page(fixture('giftcodes-kingshotmastery.html')) } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: BOTH, now: NOW });
  assert.equal(r.sources['kingshot.net'].status, 'none');
  assert.match(r.sources['kingshot.net'].error, /^blocked:/);
  assert.deepEqual(active(), ['Kingshot888', 'VIP777', 'WELLDONE']);
  const statuses = await disc.getGiftSourceStatuses({ env: BOTH, now: NOW });
  assert.equal(statuses[0].result, 'blocked');
  assert.ok(statuses[0].paused_until);
  assert.equal(statuses[1].result, 'ok');
  const netCalls = () => f.calls.filter((c) => c.url === NET).length;
  assert.equal(netCalls(), 1);
  const again = await disc.refreshGiftCodes({ fetchImpl: f, env: BOTH, now: NOW + 40 * 60 * 1000, force: true });
  assert.equal(again.sources['kingshot.net'].status, 'paused_blocked');
  assert.equal(netCalls(), 1, 'a refusing site is never contacted again within the pause');
});

test('both sources fail: existing codes untouched, nothing expired, snapshot kept', async () => {
  state.tables.gift_codes = [
    { _id: 'a', code: 'OLDCODE1', source: 'kingshot.net', sources: ['kingshot.net'], active: true },
    { _id: 'b', code: 'HANDADD1', source: 'manual', active: true },
  ];
  const f = fakeFetch({ overrides: { [NET]: status(500), [MAST]: page('<html>new layout</html>') } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: BOTH, now: NOW });
  assert.equal(r.refreshed, 0);
  assert.equal(r.delisted, 0);
  assert.deepEqual(active(), ['HANDADD1', 'OLDCODE1']);
  const st = await disc.getGiftSourceStatuses({ env: BOTH, now: NOW });
  assert.deepEqual(st.map((s) => s.result), ['failed', 'changed_shape']);
});

test('robots.txt disallowing the page stops the fetch', async () => {
  const f = fakeFetch({ robots: 'User-agent: *\nDisallow: /gift-codes\n', overrides: { [NET]: page(fixture('giftcodes-kingshot-net.html')) } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW });
  assert.equal(r.refreshed, 0);
  assert.match(r.sources['kingshot.net'].error, /^robots:/);
  assert.ok(!f.calls.some((c) => c.url === NET), 'page never requested');
  assert.equal((await disc.getGiftSourceStatuses({ env: {}, now: NOW }))[0].result, 'blocked');
});

test('no longer listed => switched off, but only after a successful non-empty parse; manual codes never; relisted comes back', async () => {
  state.tables.gift_codes = [
    { _id: 'a', code: 'GONE1234', source: 'kingshot.net', sources: ['kingshot.net'], active: true },
    { _id: 'm', code: 'HANDADD1', source: 'manual', active: true },
    { _id: 'x', code: 'MASTONLY', source: 'kingshotmastery.com', sources: ['kingshotmastery.com'], active: true },
  ];
  const f = fakeFetch({ overrides: { [NET]: page(fixture('giftcodes-kingshot-net.html')) } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW });
  assert.equal(r.delisted, 1);
  const gone = state.tables.gift_codes.find((c) => c.code === 'GONE1234');
  assert.equal(gone.active, false);
  assert.equal(gone.expired_reason, 'delisted');
  assert.ok(state.tables.gift_codes.find((c) => c.code === 'HANDADD1').active);
  assert.ok(state.tables.gift_codes.find((c) => c.code === 'MASTONLY').active, 'a source we did not read cannot expire its codes');
  // reappears later
  const rows = await state.tables.gift_codes;
  await disc.applyMergedCodes({ find: () => ({ toArray: async () => rows }), updateOne: async (flt, upd) => { Object.assign(rows.find((d) => d._id === flt._id || d.code === flt.code), upd.$set); } }, [{ code: 'GONE1234', sources: ['kingshot.net'], rewards: null, expires_at: null }], { succeeded: new Set(['kingshot.net']), now: new Date(NOW) });
  assert.equal(rows.find((c) => c.code === 'GONE1234').active, true);
});

test('an empty-but-valid list never expires anything', async () => {
  state.tables.gift_codes = [{ _id: 'a', code: 'KEEPME12', source: 'kingshot.net', sources: ['kingshot.net'], active: true }];
  const emptyPage = fixture('giftcodes-kingshot-net.html').replace(/\\"isActive\\":true/g, '\\"isActive\\":false').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const f = fakeFetch({ overrides: { [NET]: page(emptyPage) } });
  const r = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW });
  assert.equal(r.sources['kingshot.net'].codes, 0, 'the page really parsed to an empty list');
  assert.equal(r.delisted, 0);
  assert.deepEqual(active(), ['KEEPME12']);
});

test('30 minute claim: a second run inside the window makes no request; force bypasses the claim only', async () => {
  const f = fakeFetch({ overrides: { [NET]: page(fixture('giftcodes-kingshot-net.html')) } });
  await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW });
  const n = f.calls.filter((c) => c.url === NET).length;
  const again = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW + 5 * 60 * 1000 });
  assert.equal(again.refreshed, 0);
  assert.equal(f.calls.filter((c) => c.url === NET).length, n);
  const forced = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW + 6 * 60 * 1000, force: true });
  assert.equal(forced.refreshed, 1);
  assert.equal(f.calls.filter((c) => c.url === NET).length, n + 1);
  const later = await disc.refreshGiftCodes({ fetchImpl: f, env: {}, now: NOW + 60 * 60 * 1000 });
  assert.equal(later.refreshed, 1);
});

test('parseCodeList / addManualCodes: bulk paste is validated, deduped and idempotent', async () => {
  const { valid, rejected } = disc.parseCodeList('Kingshot888, VIP777\nkingshot888 bad-code <b>X</b> ab ' + 'z'.repeat(40));
  assert.deepEqual(valid, ['Kingshot888', 'VIP777']);
  assert.equal(rejected.length, 4);
  const { getCollection } = await import('../lib/mongo.js');
  const coll = await getCollection('gift_codes');
  assert.deepEqual(await disc.addManualCodes(coll, valid), { added: 2, reactivated: 0, already: 0 });
  assert.deepEqual(await disc.addManualCodes(coll, valid), { added: 0, reactivated: 0, already: 2 });
  assert.equal(state.tables.gift_codes[0].source, 'manual');
});

const req = (auth, body) => ({ headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) }, cookies: { get: () => undefined }, json: async () => body });

test('cron refuses anything but the exact CRON_SECRET bearer', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await cron.GET(req('Bearer x'))).status, 401);
  process.env.CRON_SECRET = 's3cret';
  assert.equal((await cron.GET(req(''))).status, 401);
  assert.equal((await cron.GET(req('Bearer nope'))).status, 401);
  assert.equal((await cron.POST(req('s3cret'))).status, 401);
  assert.equal(state.tables.external_snapshots, undefined, 'unauthorized calls touch nothing');
});

test('authorized cron runs discovery and writes codes (no network: stubbed fetch)', async () => {
  process.env.CRON_SECRET = 's3cret';
  const real = globalThis.fetch;
  globalThis.fetch = fakeFetch({ overrides: { [NET]: page(fixture('giftcodes-kingshot-net.html')) } });
  try {
    const res = await cron.GET(req('Bearer s3cret'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(state.tables.gift_codes.length >= 1);
  } finally {
    globalThis.fetch = real;
  }
});

test('admin API: anonymous is rejected; admin can paste, validate and read source status', async () => {
  process.env.ADMIN_PASSWORD = 'gift-admin-test-only';
  assert.equal((await adminRoute.GET(req('', null))).status, 401);
  assert.equal((await adminRoute.POST(req('', { action: 'check_sources' }))).status, 401);
  assert.equal((await adminRoute.POST(req('', { action: 'add_codes', text: 'ABCD1234' }))).status, 401);
  assert.equal(state.tables.gift_codes, undefined);

  const token = await mintAdminToken();
  const admin = (body) => ({ headers: { get: () => null }, cookies: { get: () => ({ value: token }) }, json: async () => body });
  const added = await (await adminRoute.POST(admin({ action: 'add_codes', text: 'Kingshot888\nVIP777, bad code!' }))).json();
  assert.equal(added.added, 2);
  assert.ok(added.rejected.length >= 1);
  assert.equal((await adminRoute.POST(admin({ action: 'add_codes', text: '!!' }))).status, 400);
  assert.equal((await adminRoute.POST(admin({ action: 'add_code', code: 'ab' }))).status, 400);
  assert.equal((await adminRoute.POST(admin({ action: 'add_code', code: 'Good1234' }))).status, 200);
  const got = await (await adminRoute.GET(admin(null))).json();
  assert.equal(got.sources.length, 2);
  assert.equal(got.sources[0].id, 'kingshot.net');
  assert.equal(got.sources[1].result, 'not_used');
  assert.equal(got.codes.length, 3);
});
