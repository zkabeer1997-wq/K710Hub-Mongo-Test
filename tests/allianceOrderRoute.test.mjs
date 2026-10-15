import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';

const row = (tag, sort_order, extra = {}) => ({ tag, name: tag, active: true, sort_order, ...extra });
const state = {
  tables: { alliances: [row('710', 1), row('RED', 2), row('SKY', 3), row('PHL', 0), row('OLD', 4, { active: false })] },
  revalidated: [],
  superadmin: null,
};
globalThis.__allianceOrderTest = state;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('/lib/mongo')) return { url: 'test:order-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:order-cache', shortCircuit: true };
    if (specifier.endsWith('/routeAliasesAccess.server')) return { url: 'test:order-access', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (/\/(adminAuth|mongoCollections|revalidateAlliancePages)$/.test(specifier)) return next(`${specifier}.js`, context);
    // The routes import some lib files without an extension (the bundler resolves those); do the same here.
    try { return next(specifier, context); } catch (error) {
      if (specifier.startsWith('.') && error?.code === 'ERR_MODULE_NOT_FOUND') return next(`${specifier}.js`, context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url === 'test:order-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__allianceOrderTest.tables);` };
    }
    if (url === 'test:order-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = (p) => globalThis.__allianceOrderTest.revalidated.push(p);' };
    // Stand-in for the live-role check: only a request flagged as superadmin gets a session.
    if (url === 'test:order-access') return { format: 'module', shortCircuit: true, source: 'export async function requireRouteSuperadmin(request) { return request.__superadmin ? { nickname: "Boss", playerId: "123" } : null; }' };
    return next(url, context);
  },
});
const { PUT } = await import('../app/api/admin-alliances/order/route.js');
const { POST } = await import('../app/api/admin-alliances/route.js');
const { PUT: PUT_ONE } = await import('../app/api/admin-alliances/[tag]/route.js');
process.env.ADMIN_PASSWORD = 'alliance-order-test-only';
const token = await mintAdminToken();
const mk = (body, { admin = false, superadmin = false } = {}) => ({
  cookies: { get: (name) => (admin && name === 'tff_admin_session' ? { value: token } : undefined) },
  __superadmin: superadmin,
  json: async () => body,
});
const stored = () => Object.fromEntries(state.tables.alliances.map((r) => [r.tag, r]));
const ALL = ['710', 'RED', 'SKY', 'PHL', 'OLD'];

test('no sign-in is 401, the shared admin-password cookie and a plain admin are 403, nothing is written', async () => {
  const before = JSON.stringify(state.tables.alliances);
  assert.equal((await PUT(mk({ tags: ALL }))).status, 401);
  assert.equal((await PUT(mk({ tags: ALL }, { admin: true }))).status, 403);
  assert.equal(JSON.stringify(state.tables.alliances), before);
  assert.deepEqual(state.revalidated, []);
});

test('the route checks the live superadmin role, not just the admin cookie', () => {
  const src = readFileSync(new URL('../app/api/admin-alliances/order/route.js', import.meta.url), 'utf8');
  assert.match(src, /requireRouteSuperadmin/);
  assert.match(src, /status: 403/);
});

test('a superadmin must send exactly the existing tags', async () => {
  for (const tags of [['SKY', 'SKY', '710', 'RED', 'PHL'], ['SKY', '710', 'RED', 'PHL'], [...ALL, 'NOPE'], 'SKY', undefined]) {
    assert.equal((await PUT(mk({ tags }, { superadmin: true }))).status, 400, JSON.stringify(tags));
  }
  assert.equal(stored().SKY.sort_order, 3);
  assert.equal(state.tables.alliances.some((r) => r.order_updated_at), false);
});

test('a superadmin saves the order: numbered 10, 20, ..., who and when recorded, pages revalidated', async () => {
  const res = await PUT(mk({ tags: ['sky', '710', 'RED', 'PHL', 'OLD'] }, { superadmin: true }));
  assert.equal(res.status, 200);
  const rows = stored();
  assert.deepEqual(['SKY', '710', 'RED', 'PHL', 'OLD'].map((t) => rows[t].sort_order), [10, 20, 30, 40, 50]);
  for (const r of state.tables.alliances) {
    assert.ok(r.order_updated_at instanceof Date);
    assert.equal(r.order_updated_by, 'Boss');
  }
  assert.ok(state.revalidated.includes('/alliances'));
  assert.ok(state.revalidated.includes('/'));
  assert.ok(state.revalidated.includes('/events'));
});

test('saving the same list again leaves the same numbers (idempotent)', async () => {
  assert.equal((await PUT(mk({ tags: ['SKY', '710', 'RED', 'PHL', 'OLD'] }, { superadmin: true }))).status, 200);
  assert.equal(stored().SKY.sort_order, 10);
  assert.equal(stored().OLD.sort_order, 50);
});

test('a new alliance goes last; a normal admin cannot set its order or change an existing one', async () => {
  const res = await POST({ ...mk({ tag: 'NEWA', name: 'New', sort_order: -5 }, { admin: true }) });
  assert.equal(res.status, 200);
  assert.equal(stored().NEWA.sort_order, 60);
  const edit = await PUT_ONE(mk({ name: 'Sky renamed', sort_order: 999 }, { admin: true }), { params: Promise.resolve({ tag: 'SKY' }) });
  assert.equal(edit.status, 200);
  assert.equal(stored().SKY.name, 'Sky renamed');
  assert.equal(stored().SKY.sort_order, 10);
  assert.ok(stored().SKY.order_updated_at, 'the saved order is not clobbered');
});

test('a new alliance is missing from the list until the next save: a stale full list is rejected', async () => {
  const res = await PUT(mk({ tags: ['SKY', '710', 'RED', 'PHL', 'OLD'] }, { superadmin: true }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Missing alliance: NEWA/);
});
