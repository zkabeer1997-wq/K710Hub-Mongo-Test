import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';

const state = { tables: {}, paths: [] };
globalThis.__toolKinds = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:kinds-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:kinds-cache', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(adminAuth|memberAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:kinds-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__toolKinds.tables);` };
    }
    if (u === 'test:kinds-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=p=>{globalThis.__toolKinds.paths.push(p);};' };
    return next(u, c);
  },
});
const settings = await import('../app/api/admin-tool-settings/route.js');
process.env.ADMIN_PASSWORD = 'tool-kinds-test-only';
const token = await mintAdminToken();
const req = (url, body) => ({ url, json: async () => body, cookies: { get: (k) => (k === 'tff_admin_session' ? { value: token } : undefined) } });
const get = async (kind) => (await settings.GET(req(`http://x/api/admin-tool-settings?kind=${kind}`))).json();

test('each page lists only its own kind of values', async () => {
  const pack = (await get('pack')).tools, calc = (await get('calc')).tools;
  assert.ok(pack.every((t) => t.fields.every((f) => f.kind === 'pack')));
  assert.ok(calc.every((t) => t.fields.every((f) => f.kind === 'calc')));
  assert.ok(!pack.some((t) => t.key === 'wavebound-charms'));
  assert.ok(calc.some((t) => t.key === 'wavebound-charms'));
  assert.equal((await settings.GET(req('http://x/?kind=other'))).status, 400);
});

test('saves are limited to the page kind, merged into one document, and resettable', async () => {
  const put = (body) => settings.PUT(req('http://x/', body));
  let r = await put({ tool: 'charm-pack-optimizer', kind: 'pack', quantities: { 'pack.0.price': 5.5 } });
  assert.equal(r.status, 200);
  r = await put({ tool: 'charm-pack-optimizer', kind: 'calc', quantities: { 'pack.0.price': 6 } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /belongs to Pack editing/);
  r = await put({ tool: 'wavebound-charms', kind: 'pack', quantities: { 'cost.3.g': 61 } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /belongs to Tool database/);
  assert.equal((await put({ tool: 'adventure-stall', kind: 'pack', quantities: { nope: 1 } })).status, 400);
  assert.equal((await put({ tool: 'charm-pack-optimizer', kind: 'pack', quantities: { 'pack.0.price': 0 } })).status, 400);
  assert.equal((await put({ tool: 'charm-pack-optimizer', quantities: { 'pack.0.price': 5 } })).status, 400);
  assert.equal((await put({ tool: 'wavebound-charms', kind: 'calc', quantities: { 'cost.3.g': 61 } })).status, 200);
  const calc = (await get('calc')).tools.find((t) => t.key === 'wavebound-charms');
  assert.equal(calc.quantities['cost.3.g'], 61);
  assert.ok(calc.updated_at);
  const pack = (await get('pack')).tools.find((t) => t.key === 'charm-pack-optimizer');
  assert.equal(pack.quantities['pack.0.price'], 5.5);
  assert.equal((await put({ tool: 'wavebound-charms', kind: 'calc', reset: true })).status, 200);
  assert.equal((await get('calc')).tools.find((t) => t.key === 'wavebound-charms').quantities['cost.3.g'], 60);
  assert.ok(state.paths.includes('/tools/charm-sailing-optimizer'));
  assert.ok(state.paths.includes('/tools/charms'));
});
