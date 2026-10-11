import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';

const state = { tables: {}, paths: [] };
globalThis.__toolPacksRoutes = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:packs-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:packs-cache', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(adminAuth|memberAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:packs-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__toolPacksRoutes.tables);` };
    }
    if (u === 'test:packs-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=p=>{globalThis.__toolPacksRoutes.paths.push(p);};' };
    return next(u, c);
  },
});
process.env.ADMIN_PASSWORD = 'tool-packs-routes-test-only';
const packsRoute = await import('../app/api/admin-tool-packs/route.js');
const refRoute = await import('../app/api/admin-tool-reference/route.js');
const dbRoute = await import('../app/api/admin-tool-databases/route.js');
const { loadToolConfiguration } = await import('../lib/toolSettings.js');
const token = await mintAdminToken();
const req = (body, admin = true) => ({
  url: 'http://x/',
  json: async () => { if (body === undefined) throw new Error('no body'); return body; },
  cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: token } : undefined) },
});
const call = async (fn, body, admin = true) => { const r = await fn(req(body, admin)); return { status: r.status, json: await r.json() }; };

test('every write route rejects anonymous callers and writes nothing', async () => {
  for (const [name, route, fns] of [['packs', packsRoute, ['GET', 'POST', 'PATCH', 'DELETE']], ['reference', refRoute, ['GET', 'PUT']], ['databases', dbRoute, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']]]) {
    for (const fn of fns) assert.equal((await call(route[fn], {}, false)).status, 401, `${name} ${fn}`);
  }
  assert.equal(Object.values(state.tables).flat().length, 0);
});

test('custom packs: create, list, edit, disable, delete, and member tools pick them up', async () => {
  const body = { tool: 'adventure-stall', name: 'Weekend Deal', price: 7.99, amount: 150, limit: 2 };
  let r = await call(packsRoute.POST, body);
  assert.equal(r.status, 200);
  const id = r.json.pack.id;
  assert.equal(r.json.pack.enabled, true);
  assert.ok(state.paths.includes('/tools/adventure-stall'));

  assert.equal((await call(packsRoute.POST, body)).status, 400, 'duplicate name');
  assert.equal((await call(packsRoute.POST, { ...body, name: 'Bad price', price: 0 })).status, 400);
  assert.equal((await call(packsRoute.POST, { ...body, name: 'Odd', amount: 7 })).status, 400);
  assert.equal((await call(packsRoute.POST, { ...body, tool: 'pet-pack-optimizer' })).status, 400);
  assert.equal((await call(packsRoute.POST, { ...body, name: 'x'.repeat(41) })).status, 400);

  let list = (await call(packsRoute.GET)).json;
  assert.equal(list.packs.length, 1);
  assert.equal(list.max_per_tool, 12);

  let config = await loadToolConfiguration('adventure-stall');
  assert.deepEqual(config.packs.at(-1), { key: `custom-${id}`, name: 'Weekend Deal', shells: 150, cents: 799, perDay: 2, custom: true });
  assert.equal(config.packs.length, 8, 'seven built-in packs plus the custom one');

  r = await call(packsRoute.PATCH, { id, price: 8.49, limit: 3 });
  assert.equal(r.status, 200);
  assert.equal(r.json.pack.price, 8.49);
  assert.equal((await call(packsRoute.PATCH, { id, price: -2 })).status, 400);
  assert.equal((await call(packsRoute.PATCH, { id, enabled: 'yes' })).status, 400);
  assert.equal((await call(packsRoute.PATCH, { id: 'nope1234' })).status, 404);
  assert.equal((await call(packsRoute.PATCH, { id: '../x' })).status, 400);

  r = await call(packsRoute.PATCH, { id, enabled: false });
  assert.equal(r.json.pack.enabled, false);
  assert.equal(r.json.pack.price, 8.49, 'disable keeps the other fields');
  config = await loadToolConfiguration('adventure-stall');
  assert.equal(config.packs.length, 7, 'a disabled pack is hidden from the tool');

  await call(packsRoute.PATCH, { id, enabled: true });
  const dragon = await call(packsRoute.POST, { tool: 'flamedragon-shop', name: 'Weekend Deal', price: 3, amount: 300, limit: 4 });
  assert.equal(dragon.status, 200, 'the same name is fine in another tool');
  const dconfig = await loadToolConfiguration('dragons-caravan-optimizer');
  assert.deepEqual(dconfig.packs.at(-1), { key: `custom-${dragon.json.pack.id}`, name: 'Weekend Deal', essence: 300, cents: 300, defaultMax: 4, custom: true });
  assert.equal((await loadToolConfiguration('adventure-stall')).packs.some((p) => p.key === `custom-${dragon.json.pack.id}`), false, 'packs never cross tools');

  assert.equal((await call(packsRoute.DELETE, { id })).status, 200);
  assert.equal((await call(packsRoute.DELETE, { id })).status, 404);
  assert.equal((await loadToolConfiguration('adventure-stall')).packs.length, 7);
  await call(packsRoute.DELETE, { id: dragon.json.pack.id });
  list = (await call(packsRoute.GET)).json;
  assert.equal(list.packs.length, 0);
});

test('custom packs: at most 12 per tool', async () => {
  for (let i = 0; i < 12; i += 1) assert.equal((await call(packsRoute.POST, { tool: 'adventure-stall', name: `Pack ${i}`, price: 1 + i, amount: 5, limit: 1 })).status, 200);
  const r = await call(packsRoute.POST, { tool: 'adventure-stall', name: 'One too many', price: 1, amount: 5, limit: 1 });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /at most 12/);
  for (const p of (await call(packsRoute.GET)).json.packs) await call(packsRoute.DELETE, { id: p.id });
});

test('built-in packs are unaffected by custom pack routes (they have no custom id)', async () => {
  assert.equal((await call(packsRoute.DELETE, { id: '20' })).status, 400);
  assert.equal((await call(packsRoute.PATCH, { id: 'custom-20', price: 1 })).status, 400);
});

test('reference tables: GET defaults, save, reject bad input, reset', async () => {
  let { json } = await call(refRoute.GET);
  const charm = json.tables.find((t) => t.key === 'charm-levels');
  assert.equal(charm.overridden, false);
  assert.equal(charm.updated_at, null);
  assert.ok(json.tables.find((t) => t.key === 'gear-tiers').rows.length > 40);

  const rows = charm.rows.map((r) => ({ id: r.id, guides: r.guides, designs: r.designs, health: r.health, power: r.power }));
  rows[1].health = 12;
  let r = await call(refRoute.PUT, { table: 'charm-levels', rows });
  assert.equal(r.status, 200);
  assert.equal(r.json.table.overridden, true);
  assert.ok(r.json.table.updated_at);
  assert.ok(state.paths.includes('/tools/charms'));

  const bad = rows.map((x) => ({ ...x }));
  bad[0].guides = -4;
  assert.equal((await call(refRoute.PUT, { table: 'charm-levels', rows: bad })).status, 400);
  assert.equal((await call(refRoute.PUT, { table: 'charm-levels', rows: rows.slice(2) })).status, 400);
  assert.equal((await call(refRoute.PUT, { table: 'nope', rows })).status, 400);
  assert.equal((await call(refRoute.PUT, undefined)).status, 400);

  const config = await loadToolConfiguration('charm-pack-optimizer');
  assert.equal(config.charmLevels[2].health, 12, 'the charm planner configuration carries the override');
  assert.equal(config.charmLevels[2].lethality, 12);
  assert.equal(config.charmLevels[0], null);
  const untouched = await loadToolConfiguration('wavebound-charms');
  assert.equal(untouched.charmLevels, undefined);

  json = (await call(refRoute.GET)).json;
  assert.equal(json.tables.find((t) => t.key === 'charm-levels').rows[1].health, 12);

  r = await call(refRoute.PUT, { table: 'charm-levels', reset: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.table.overridden, false);
  assert.equal((await loadToolConfiguration('charm-pack-optimizer')).charmLevels, undefined, 'reset falls back to the built-in module');
});

test('reference tables: gear tier override is stored but only affects its own table', async () => {
  const table = (await call(refRoute.GET)).json.tables.find((t) => t.key === 'gear-tiers');
  const rows = table.rows.map(({ id, satin, threads, visions, power, statGain, setBonus }) => ({ id, satin, threads, visions, power, statGain, setBonus }));
  rows[0].satin += 1;
  const r = await call(refRoute.PUT, { table: 'gear-tiers', rows });
  assert.equal(r.status, 200);
  assert.equal(r.json.table.rows[0].satin, rows[0].satin);
  await call(refRoute.PUT, { table: 'gear-tiers', reset: true });
  assert.equal((await call(refRoute.GET)).json.tables.find((t) => t.key === 'gear-tiers').overridden, false);
});

test('databases: create, edit, reorder, delete with unique names', async () => {
  const body = { name: 'Chest odds', columns: ['Common', 'Rare'], rows: [{ label: 'Chest A', values: [1, 2.5] }] };
  let r = await call(dbRoute.POST, body);
  assert.equal(r.status, 200);
  const a = r.json.database.id;
  assert.equal((await call(dbRoute.POST, { ...body, name: 'chest ODDS' })).status, 400);
  assert.equal((await call(dbRoute.POST, { ...body, name: 'Bad', rows: [{ label: 'x', values: [1, 'two'] }] })).status, 400);
  assert.equal((await call(dbRoute.POST, { ...body, name: 'Bad2', columns: [] })).status, 400);
  const b = (await call(dbRoute.POST, { ...body, name: 'Second' })).json.database.id;

  r = await call(dbRoute.PUT, { id: a, name: 'Chest odds v2', columns: ['Common', 'Rare', 'Epic'], rows: [{ label: 'Chest A', values: [1, 2.5, 3] }, { label: 'Chest B', values: [0, 0, 0] }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.database.columns, ['Common', 'Rare', 'Epic']);
  assert.equal((await call(dbRoute.PUT, { id: a, name: 'Second', columns: ['A'], rows: [] })).status, 400, 'cannot take another database name');
  assert.equal((await call(dbRoute.PUT, { id: a, name: 'Chest odds v2', columns: ['A'], rows: [] })).status, 200, 'keeping its own name is fine');
  assert.equal((await call(dbRoute.PUT, { id: 'db-missing1', name: 'x', columns: ['A'], rows: [] })).status, 404);

  let list = (await call(dbRoute.GET)).json;
  assert.deepEqual(list.databases.map((d) => d.id), [a, b]);
  assert.equal(list.limits.max_rows, 200);
  r = await call(dbRoute.PATCH, { id: b, move: 'up' });
  assert.deepEqual(r.json.databases.map((d) => d.id), [b, a]);
  assert.equal((await call(dbRoute.PATCH, { id: b, move: 'sideways' })).status, 400);
  assert.deepEqual((await call(dbRoute.PATCH, { id: b, move: 'up' })).json.databases.map((d) => d.id), [b, a], 'moving the first item up is a no-op');

  assert.equal((await call(dbRoute.DELETE, { id: a })).status, 200);
  assert.equal((await call(dbRoute.DELETE, { id: a })).status, 404);
  assert.equal((await call(dbRoute.DELETE, { id: '$ne' })).status, 400);
  list = (await call(dbRoute.GET)).json;
  assert.deepEqual(list.databases.map((d) => d.id), [b]);
  await call(dbRoute.DELETE, { id: b });
});

test('databases: at most 20', async () => {
  for (let i = 0; i < 20; i += 1) assert.equal((await call(dbRoute.POST, { name: `DB ${i}`, columns: ['A'], rows: [] })).status, 200);
  const r = await call(dbRoute.POST, { name: 'Overflow', columns: ['A'], rows: [] });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /at most 20/);
  for (const d of (await call(dbRoute.GET)).json.databases) await call(dbRoute.DELETE, { id: d.id });
});
