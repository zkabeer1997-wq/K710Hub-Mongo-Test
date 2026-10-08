import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeMongo } from './helpers/fakeMongo.mjs';
import { fakeFetch } from './helpers/externalFakes.mjs';
import { createSnapshotStore, loadExternal } from '../lib/external/snapshotStore.mjs';
import { loadKvkRecord, normalizeKvkRecord } from '../lib/external/kvkRecord.mjs';
import { parseTimelineResponse } from '../lib/external/timelineParse.mjs';
import { fetchExternal, fetchJson, resetRobotsCache } from '../lib/external/http.mjs';
import { SNAPSHOT_KEYS, userAgent } from '../lib/external/sources.mjs';
import { COLLECTIONS } from '../lib/mongoCollections.js';

const MIN = 60e3;
const T0 = Date.parse('2026-10-08T12:00:00Z');
const newStore = () => {
  const tables = {};
  const mongo = createFakeMongo(tables, { [COLLECTIONS.EXTERNAL_SNAPSHOTS]: ['_id'] });
  return { tables, store: createSnapshotStore(mongo.getCollection) };
};
const def = (fetcher, key = 'k:test') => ({ key, sourceUrl: 'https://kingshotoptimizer.com/x', fetcher, parse: (x) => x });

describe('snapshot store: claim / lock', () => {
  it('lets exactly one caller attempt per 30 minute window', async () => {
    const { store } = newStore();
    const now = new Date(T0);
    assert.equal(await store.claimAttempt('a', now), true);
    assert.equal(await store.claimAttempt('a', new Date(T0 + 10 * MIN)), false);
    assert.equal(await store.claimAttempt('a', new Date(T0 + 29 * MIN)), false);
    assert.equal(await store.claimAttempt('a', new Date(T0 + 31 * MIN)), true);
    assert.equal(await store.claimAttempt('b', now), true); // independent per source
  });
  it('concurrent claims race to a single winner', async () => {
    const { store } = newStore();
    const results = await Promise.all([1, 2, 3, 4].map(() => store.claimAttempt('race', new Date(T0))));
    assert.equal(results.filter(Boolean).length, 1);
  });
});

describe('loadExternal: cache, refresh, fallback', () => {
  it('fetches once when nothing is stored, then serves fresh snapshot without fetching', async () => {
    const { store } = newStore();
    let calls = 0;
    const fetcher = async () => { calls += 1; return { n: calls }; };
    const first = await loadExternal({ ...def(fetcher), store, now: T0 });
    assert.equal(first.status, 'refreshed');
    assert.deepEqual(first.payload, { n: 1 });
    const second = await loadExternal({ ...def(fetcher), store, now: T0 + 59 * MIN });
    assert.equal(second.status, 'fresh');
    assert.equal(calls, 1);
    assert.equal(second.stale, false);
  });
  it('refreshes after 60 minutes, but not twice inside the 30 minute attempt window', async () => {
    const { store } = newStore();
    let calls = 0;
    const fetcher = async () => { calls += 1; return { n: calls }; };
    await loadExternal({ ...def(fetcher), store, now: T0 });
    const r = await loadExternal({ ...def(fetcher), store, now: T0 + 61 * MIN });
    assert.equal(r.status, 'refreshed');
    assert.equal(calls, 2);
    // forced-stale (freshMs 0, as cron does) right after: attempt claim blocks the stampede
    const again = await loadExternal({ ...def(fetcher), store, now: T0 + 62 * MIN, freshMs: 0 });
    assert.equal(again.status, 'snapshot');
    assert.equal(calls, 2);
  });
  it('serves the last good snapshot when the source fails, flags stale after 6h, and records the error', async () => {
    const { store, tables } = newStore();
    await loadExternal({ ...def(async () => ({ ok: 1 })), store, now: T0 });
    const boom = async () => { throw Object.assign(new Error('down'), { code: 'timeout' }); };
    const r1 = await loadExternal({ ...def(boom), store, now: T0 + 90 * MIN });
    assert.equal(r1.status, 'snapshot');
    assert.deepEqual(r1.payload, { ok: 1 });
    assert.equal(r1.stale, false);
    assert.equal(r1.error, 'timeout');
    const r2 = await loadExternal({ ...def(boom), store, now: T0 + 7 * 60 * MIN });
    assert.equal(r2.stale, true);
    assert.equal(tables[COLLECTIONS.EXTERNAL_SNAPSHOTS][0].last_error, 'down');
    assert.deepEqual(tables[COLLECTIONS.EXTERNAL_SNAPSHOTS][0].payload, { ok: 1 });
  });
  it('keeps the snapshot when the source changes shape (parser throws)', async () => {
    const { store } = newStore();
    await loadExternal({ ...def(async () => ({ result: { unlocks: { 'gen1-heroes': '2025-07-26' } }, success: true })), parse: parseTimelineResponse, store, now: T0 });
    const bad = await loadExternal({ ...def(async () => ({ html: '<!doctype html>' })), parse: parseTimelineResponse, store, now: T0 + 70 * MIN });
    assert.equal(bad.status, 'snapshot');
    assert.equal(bad.payload.milestones[0].slug, 'gen1-heroes');
  });
  it('reports none (stale) with no snapshot and a failing source; never throws', async () => {
    const { store } = newStore();
    const r = await loadExternal({ ...def(async () => { throw new Error('x'); }), store, now: T0 });
    assert.equal(r.status, 'none');
    assert.equal(r.payload, null);
    assert.equal(r.stale, true);
  });
  it('does not fetch at all when allowFetch is false, and survives a broken store', async () => {
    const { store } = newStore();
    let calls = 0;
    const r = await loadExternal({ ...def(async () => { calls += 1; return {}; }), store, now: T0, allowFetch: false });
    assert.equal(calls, 0);
    assert.equal(r.status, 'none');
    const broken = { read: async () => { throw new Error('mongo down'); }, claimAttempt: async () => { throw new Error('mongo down'); }, write: async () => {}, recordFailure: async () => {} };
    const r2 = await loadExternal({ ...def(async () => { calls += 1; return {}; }), store: broken, now: T0 });
    assert.equal(calls, 0); // cannot coordinate -> do not hit the third party
    assert.equal(r2.status, 'none');
  });
});

describe('KvK record: three independent sources', () => {
  it('normalizes the saved real responses', async () => {
    const { store } = newStore();
    const rec = await loadKvkRecord({ store, fetchImpl: fakeFetch(), now: T0 });
    assert.equal(rec.record.wins, 11);
    assert.equal(rec.record.losses, 2);
    assert.deepEqual(rec.record.streak, { type: 'L', count: 1 });
    assert.deepEqual(rec.record.prep, { wins: 5, losses: 8 });
    assert.equal(rec.ranking.rank, 260);
    assert.equal(rec.ranking.of, 2263);
    assert.equal(rec.matchups[0].opponent, 652);
    assert.equal(rec.matchups[0].result, 'loss');
    assert.equal(rec.matchups[1].result, 'win');
    assert.equal(rec.matchups.length, 8);
    assert.equal(rec.stale, false);
    assert.equal(rec.isDefault, false);
    assert.equal(rec.atlas.origin, 'default'); // Atlas page carries no numbers
    assert.equal(rec.sources.length, 3);
    assert.ok(rec.sources.every((s) => s.url.startsWith('https://')));
    assert.equal(rec.sources.find((s) => /Atlas/.test(s.name)).status, 'unavailable');
  });
  it('one source failing does not hide the others', async () => {
    const { store } = newStore();
    const f = fakeFetch({ overrides: { 'https://kingshotoptimizer.com/api/kvk-rankings': (init) => (JSON.parse(init.body).type === 'kingdom' ? fakeFetch().res(500, 'err') : fakeFetch().res(200, '{"success":true,"result":{"metadata":{"total_kingdoms":9,"total_kvks":2}}}')) } });
    const rec = await loadKvkRecord({ store, fetchImpl: f, now: T0 });
    assert.equal(rec.isDefault, true); // record falls back to the dated defaults...
    assert.equal(rec.stale, true);
    assert.equal(rec.sources.find((s) => /matchups/.test(s.name)).status, 'live'); // ...but the other source still loaded
  });
  it('falls back to the snapshot when everything is blocked, then to defaults when there is none', async () => {
    const { store } = newStore();
    await loadKvkRecord({ store, fetchImpl: fakeFetch(), now: T0 });
    const blocked = async () => { throw new Error('ECONNREFUSED'); };
    const snap = await loadKvkRecord({ store, fetchImpl: blocked, now: T0 + 3 * 3600e3 });
    assert.equal(snap.record.wins, 11);
    assert.equal(snap.isDefault, false);
    assert.equal(snap.sources[0].status, 'snapshot');
    const old = await loadKvkRecord({ store, fetchImpl: blocked, now: T0 + 8 * 3600e3 });
    assert.equal(old.stale, true);
    const empty = newStore();
    const none = await loadKvkRecord({ store: empty.store, fetchImpl: blocked, now: T0 });
    assert.equal(none.isDefault, true);
    assert.equal(typeof none.record.wins, 'number');
    assert.ok(none.defaultAsOf);
  });
  it('applies a manual Atlas override only when Atlas gives no numbers', () => {
    const rec = normalizeKvkRecord({ override: { atlas: { rank: '99', score: 60, tier: '<b>S</b>', asOf: '2026-10-01' } } });
    assert.equal(rec.atlas.origin, 'manual');
    assert.equal(rec.atlas.rank, 99);
    assert.equal(rec.atlas.tier, 'b S /b');
    const live = normalizeKvkRecord({ atlas: { available: true, rank: 5, score: 1, tier: null, topPercent: null }, override: { atlas: { rank: 99 } } });
    assert.equal(live.atlas.origin, 'live');
    assert.equal(live.atlas.rank, 5);
  });
});

describe('fetchExternal: responsible fetching', () => {
  it('sends the K710Hub User-Agent and checks robots.txt first', async () => {
    resetRobotsCache();
    const f = fakeFetch();
    const json = await fetchJson('https://kingshotoptimizer.com/api/kvk-timeline', { method: 'POST', json: { kingdomId: 710 }, fetchImpl: f, now: T0 });
    assert.equal(json.success, true);
    assert.equal(f.calls[0].url, 'https://kingshotoptimizer.com/robots.txt');
    assert.match(f.calls[1].headers['User-Agent'], /^K710Hub-KingdomSite\/1\.0 \(\+https?:\/\//);
    assert.equal(userAgent('https://example.org/'), 'K710Hub-KingdomSite/1.0 (+https://example.org)');
  });
  it('refuses paths robots.txt disallows (no fetch, no workaround)', async () => {
    resetRobotsCache();
    const f = fakeFetch({ robots: 'User-agent: *\nDisallow: /api/\n' });
    await assert.rejects(fetchExternal('https://kingshotoptimizer.com/api/kvk-timeline', { fetchImpl: f, now: T0 }), (e) => e.code === 'robots');
    assert.equal(f.calls.length, 1); // only robots.txt itself
  });
  it('rejects non-allow-listed hosts, http, and credentials', async () => {
    const f = fakeFetch();
    for (const url of ['https://evil.example/x', 'http://kingshotoptimizer.com/', 'https://user:pw@ks-atlas.com/', 'https://kingshotoptimizer.com.evil.example/', 'not a url']) {
      await assert.rejects(fetchExternal(url, { fetchImpl: f }), (e) => e.code === 'host');
    }
    assert.equal(f.calls.length, 0);
  });
  it('does not follow a redirect off the allow-list', async () => {
    resetRobotsCache();
    const f = fakeFetch({ overrides: { 'https://ks-atlas.com/kingdom/710': { status: 301, headers: { get: () => 'https://evil.example/' }, text: async () => '' } } });
    await assert.rejects(fetchExternal('https://ks-atlas.com/kingdom/710', { fetchImpl: f, now: T0 }), (e) => e.code === 'host');
  });
  it('reports blocks (403/429), server errors and timeouts as errors without retrying', async () => {
    resetRobotsCache();
    for (const status of [403, 429, 500]) {
      const f = fakeFetch({ overrides: { 'https://ks-atlas.com/kingdom/710': { status, headers: { get: () => null }, text: async () => 'x' } } });
      await assert.rejects(fetchExternal('https://ks-atlas.com/kingdom/710', { fetchImpl: f, now: T0 }), (e) => e.code === 'http');
      assert.equal(f.calls.filter((c) => c.url.includes('/kingdom/')).length, 1);
    }
    const hang = (url, init) => (String(url).endsWith('robots.txt') ? Promise.resolve({ status: 200, headers: { get: () => null }, text: async () => '' }) : new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    await assert.rejects(fetchExternal('https://ks-atlas.com/kingdom/710', { fetchImpl: hang, timeoutMs: 20, now: T0 }), (e) => e.code === 'timeout');
  });
  it('errors when robots.txt cannot be checked rather than assuming consent', async () => {
    resetRobotsCache();
    const f = fakeFetch({ overrides: { 'https://ks-atlas.com/robots.txt': { status: 503, headers: { get: () => null }, text: async () => '' } } });
    await assert.rejects(fetchExternal('https://ks-atlas.com/kingdom/710', { fetchImpl: f, now: T0 }), (e) => e.code === 'robots');
  });
  it('rejects oversized and non-JSON bodies', async () => {
    resetRobotsCache();
    const big = fakeFetch({ overrides: { 'https://ks-atlas.com/kingdom/710': { status: 200, headers: { get: (k) => (k === 'content-length' ? '99999999' : null) }, text: async () => 'x' } } });
    await assert.rejects(fetchExternal('https://ks-atlas.com/kingdom/710', { fetchImpl: big, now: T0 }), (e) => e.code === 'size');
    const html = fakeFetch({ overrides: { 'https://kingshotoptimizer.com/api/kvk-timeline': { status: 200, headers: { get: () => null }, text: async () => '<html>' } } });
    await assert.rejects(fetchJson('https://kingshotoptimizer.com/api/kvk-timeline', { method: 'POST', json: {}, fetchImpl: html, now: T0 }), (e) => e.code === 'shape');
  });
});

describe('snapshot keys', () => {
  it('are fixed strings', () => {
    assert.equal(SNAPSHOT_KEYS.timeline, 'optimizer:timeline:710');
  });
});
