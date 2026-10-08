import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';

const state = { tables: { events: [{ id: 'series-1', slug: 'sg', title: 'Strongest Governor', kind: 'custom', starts_at: '2026-10-01T20:00:00.000Z', ends_at: null, recurrence_frequency: 'weekly', recurrence_interval: 1, published: true }] } };
globalThis.__adminEventsCalendarTest = state;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('/lib/mongo')) return { url: 'test:cal-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:cal-cache', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (/\/(adminAuth|mongoCollections)$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:cal-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__adminEventsCalendarTest.tables);` };
    }
    if (url === 'test:cal-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = () => {};' };
    return next(url, context);
  },
});
const { POST } = await import('../app/api/admin-events/route.js');
const { PUT, DELETE } = await import('../app/api/admin-events/[id]/route.js');
process.env.ADMIN_PASSWORD = 'admin-events-calendar-test-only';
const token = await mintAdminToken();
const request = body => ({ cookies: { get: () => ({ value: token }) }, json: async () => body });
const params = id => ({ params: Promise.resolve({ id }) });
const base = { slug: 'qa-test-new', title: 'Test event', kind: 'custom', starts_at: '2026-10-14T20:00:00Z', published: true };

test('create stores the additive calendar fields', async () => {
  const res = await POST(request({ ...base, ends_at: '2026-10-14T22:00:00Z', recurrence_frequency: 'weekly', recurrence_weekdays: [4, 1], exdates: ['2026-10-19T20:00:00Z'], guide_slug: 'qa-test-rally-basics', alliance_tags: ['red'], all_day: false }));
  assert.equal(res.status, 200);
  const { event } = await res.json();
  assert.deepEqual(event.recurrence_weekdays, [1, 4]);
  assert.equal(event.guide_slug, 'qa-test-rally-basics');
  assert.deepEqual(event.alliance_tags, ['RED']);
  assert.deepEqual(event.exdates, ['2026-10-19T20:00:00.000Z']);
});
test('events without the new fields still save with safe defaults', async () => {
  const { event } = await (await POST(request({ ...base, slug: 'qa-test-plain' }))).json();
  assert.equal(event.guide_slug, null);
  assert.deepEqual(event.alliance_tags, []);
  assert.deepEqual(event.exdates, []);
  assert.equal(event.recurrence_weekdays, null);
});
test('validation rejects bad guide slugs, alliances, weekdays and duplicate slugs', async () => {
  assert.equal((await POST(request({ ...base, slug: 'qa-test-a', guide_slug: 'No Good' }))).status, 400);
  assert.equal((await POST(request({ ...base, slug: 'qa-test-b', alliance_tags: 'RED' }))).status, 400);
  assert.equal((await POST(request({ ...base, slug: 'qa-test-c', recurrence_frequency: 'weekly', recurrence_weekdays: [9] }))).status, 400);
  assert.equal((await POST(request({ ...base, slug: 'qa-test-d', exdates: ['bad'] }))).status, 400);
  assert.equal((await POST(request({ ...base, slug: 'sg' }))).status, 409);
});
test('PUT can skip one occurrence via exdates and keeps the rest of the series', async () => {
  const res = await PUT(request({ exdates: ['2026-10-08T20:00:00Z'] }), params('series-1'));
  assert.equal(res.status, 200);
  const row = state.tables.events.find(e => e.id === 'series-1');
  assert.deepEqual(row.exdates, ['2026-10-08T20:00:00.000Z']);
  assert.equal(row.recurrence_frequency, 'weekly');
  assert.equal((await PUT(request({ guide_slug: '/bad' }), params('series-1'))).status, 400);
  assert.equal((await PUT(request({ guide_slug: 'a-guide' }), params('series-1'))).status, 200);
});
test('delete removes the series', async () => {
  assert.equal((await DELETE(request({}), params('series-1'))).status, 200);
  assert.equal(state.tables.events.some(e => e.id === 'series-1'), false);
});
