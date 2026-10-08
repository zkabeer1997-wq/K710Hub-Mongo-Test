import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { fakeFetch } from './helpers/externalFakes.mjs';

const state = { tables: {} };
globalThis.__extTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ext-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:ext-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__extTest.tables, {external_snapshots:['_id']});` };
    }
    return next(u, c);
  },
});

const route = await import('../app/api/cron/refresh-external/route.js');
const timelineRoute = await import('../app/api/timeline/route.js');
const req = (auth) => ({ headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) } });

test('cron refuses requests without the exact CRON_SECRET bearer', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await route.GET(req('Bearer anything'))).status, 401); // no secret configured: closed
  process.env.CRON_SECRET = 's3cret';
  assert.equal((await route.GET(req(''))).status, 401);
  assert.equal((await route.GET(req('Bearer wrong'))).status, 401);
  assert.equal((await route.GET(req('s3cret'))).status, 401);
  assert.equal((await route.POST(req('Bearer nope'))).status, 401);
});

test('authorized cron refreshes every source into external_snapshots, then respects the 30 minute claim', async () => {
  process.env.CRON_SECRET = 's3cret';
  const realFetch = globalThis.fetch;
  const f = fakeFetch();
  globalThis.fetch = f;
  try {
    const res = await route.GET(req('Bearer s3cret'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.deepEqual(Object.keys(body.results).sort(), ['atlas', 'kingdom', 'matchups', 'timeline']);
    for (const r of Object.values(body.results)) assert.equal(r.status, 'refreshed');
    const docs = state.tables.external_snapshots;
    assert.equal(docs.length, 4);
    const tl = docs.find((d) => d._id === 'optimizer:timeline:710');
    assert.ok(tl.hash && tl.fetched_at instanceof Date && tl.source_url.startsWith('https://kingshotoptimizer.com/'));
    assert.equal(tl.payload.createdDate, '2025-07-26');

    const before = f.calls.length;
    const again = await (await route.GET(req('Bearer s3cret'))).json();
    for (const r of Object.values(again.results)) assert.equal(r.status, 'snapshot');
    assert.equal(f.calls.length, before, 'no third-party request inside the 30 minute window');

    const pub = await (await timelineRoute.GET()).json();
    assert.equal(pub.available, true);
    assert.equal(pub.createdDate, '2025-07-26');
    assert.ok(pub.chapters.length > 20);
    assert.equal(pub.source.url, 'https://kingshotoptimizer.com/kingdom-timeline/710/');
  } finally {
    globalThis.fetch = realFetch;
  }
});
