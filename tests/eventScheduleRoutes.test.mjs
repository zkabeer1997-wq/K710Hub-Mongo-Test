import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';

const state = {
  tables: {
    events: [
      { id: 'event-id', slug: 'event', starts_at: '2026-09-01T20:00:00Z', ends_at: '2026-09-01T21:00:00Z', recurrence_frequency: 'weekly', recurrence_interval: 2, recurrence_until: '2026-12-31' },
    ],
  },
};
const existing = () => state.tables.events.find((e) => e.id === 'event-id');
const newest = () => state.tables.events.at(-1);
globalThis.__eventScheduleTest = state;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('/lib/mongo')) return { url: 'test:event-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:event-cache', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (/\/(adminAuth|mongoCollections)$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:event-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return {
        format: 'module',
        shortCircuit: true,
        source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__eventScheduleTest.tables);`,
      };
    }
    if (url === 'test:event-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = () => {};' };
    return next(url, context);
  },
});
const { POST } = await import('../app/api/admin-events/route.js');
const { PUT } = await import('../app/api/admin-events/[id]/route.js');
process.env.ADMIN_PASSWORD = 'event-schedule-test-only';
const token = await mintAdminToken();
const request = (body, admin = true) => ({ cookies: { get: () => admin ? { value: token } : undefined }, json: async () => body });
const params = { params: Promise.resolve({ id: 'event-id' }) };

test('event mutations require admin authentication', async () => {
  assert.equal((await POST(request({}, false))).status, 401);
  assert.equal((await PUT(request({}, false), params)).status, 401);
  assert.equal(state.tables.events.length, 1);
});
test('creation saves frequency, interval and stop date together', async () => {
  const result = await POST(request({ ...existing(), title: 'Weekly event', kind: 'custom', published: true }));
  assert.equal(result.status, 200);
  assert.equal(newest().recurrence_interval, 2);
  assert.equal(newest().recurrence_until, '2026-12-31');
});
test('partial edit keeps existing repeat schedule and rejects invalid stop dates', async () => {
  assert.equal((await PUT(request({ title: 'New title' }), params)).status, 200);
  assert.equal(existing().recurrence_frequency, 'weekly');
  const before = { ...existing() };
  assert.equal((await PUT(request({ recurrence_until: '2026-01-01' }), params)).status, 400);
  assert.deepEqual(existing(), before);
});
test('editing back to one-off clears stop date and interval', async () => {
  assert.equal((await PUT(request({ recurrence_frequency: 'none' }), params)).status, 200);
  assert.equal(existing().recurrence_until, null);
  assert.equal(existing().recurrence_interval, 1);
});
