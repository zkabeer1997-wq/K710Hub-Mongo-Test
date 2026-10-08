import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';

const state = { tables: {}, fail: false };
globalThis.__toolImgTest = state;
registerHooks({
  resolve(s, c, next) {
    { const r = driveHookResolve(s, c, next); if (r) return r; }
    if (/\/toolImages\.server$/.test(s)) return next(s + '.js', c);
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ti-mongo', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(adminAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    { const l = driveHookLoad(u); if (l) return l; }
    if (u === 'test:ti-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; const m=createFakeMongo(globalThis.__toolImgTest.tables); export const getCollection=async(n)=>{ if(globalThis.__toolImgTest.fail) throw new Error('mongo down'); return m.getCollection(n); }; export const ensureIndexes=m.ensureIndexes;` };
    }
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'tool-images-test-only';
const route = await import('../app/api/admin-tool-images/route.js');
const publicRoute = await import('../app/api/tool-images/route.js');
const imagesRoute = await import('../app/api/admin-drive/images/route.js');
const serverMod = await import('../lib/toolImages.server.js');
const lib = await import('../lib/toolImages.mjs');
const { TOOL_KEYS } = await import('../lib/toolHubTools.mjs');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');
const token = await mintAdminToken();
const req = (admin, body = {}, url = 'http://localhost/api/admin-tool-images') => ({
  url, headers: new Headers(), cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: token } : undefined) },
  json: async () => body, formData: async () => body,
});
setDriveStorageFactory(() => tmpFakeDriveInstance);
const tmpFakeDriveInstance = await tmpFakeDrive();

async function upload(name = 'a.png') {
  const form = new FormData();
  form.set('folder', 'tool'); form.set('alt', 'x'); form.set('file', new File([PNG], name, { type: 'image/png' }));
  const res = await imagesRoute.POST(req(true, form));
  assert.equal(res.status, 201);
  return (await res.json()).image;
}

test('every tool-images admin route rejects anonymous callers', async () => {
  for (const call of [() => route.GET(req(false)), () => route.PUT(req(false, { tool_key: 'charms' })), () => route.DELETE(req(false, { tool_key: 'charms' }))]) {
    assert.equal((await call()).status, 401);
  }
});

test('set, replace, list and reset an override; defaults stay for other tools', async () => {
  const one = await upload('one.png'); const two = await upload('two.png');
  let res = await route.PUT(req(true, { tool_key: 'charms', site_image_id: one.id, alt: 'Charm art' }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).image.url, `/api/site-image/${one.id}`);
  res = await route.PUT(req(true, { tool_key: 'charms', site_image_id: two.id, alt: 'New art' }));
  assert.equal(res.status, 200);
  assert.equal(state.tables.tool_images.length, 1, 'replace keeps one row per tool');
  const list = (await (await route.GET(req(true))).json()).tools;
  assert.equal(list.length, TOOL_KEYS.length);
  assert.equal(list.find((t) => t.key === 'charms').image.url, `/api/site-image/${two.id}`);
  assert.equal(list.find((t) => t.key === 'pets').image, null);
  const text = JSON.stringify(list);
  assert.doesNotMatch(text, /drive_file_id/);
  assert.equal((await (await publicRoute.GET()).json()).images.charms.alt, 'New art', 'admin write invalidates the 30s cache');
});

test('reset restores the default and is idempotent', async () => {
  assert.equal((await route.DELETE(req(true, { tool_key: 'charms' }))).status, 200);
  assert.equal((await route.DELETE(req(true, { tool_key: 'charms' }))).status, 200);
  assert.deepEqual((await (await publicRoute.GET()).json()).images, {});
});

test('unknown tool keys, missing alt, bad ids and non-tool images are rejected', async () => {
  const img = await upload('v.png');
  const put = (b) => route.PUT(req(true, b));
  assert.equal((await put({ tool_key: 'not-a-tool', site_image_id: img.id, alt: 'a' })).status, 400);
  assert.equal((await put({ tool_key: 'pets', site_image_id: img.id, alt: '   ' })).status, 400);
  assert.equal((await put({ tool_key: 'pets', site_image_id: 'nope', alt: 'a' })).status, 400);
  assert.equal((await put({ tool_key: 'pets', site_image_id: '11111111-1111-4111-8111-111111111111', alt: 'a' })).status, 400);
  state.tables.site_images.find((d) => d._id === img.id).folder = 'gallery';
  assert.equal((await put({ tool_key: 'pets', site_image_id: img.id, alt: 'a' })).status, 400);
  state.tables.site_images.find((d) => d._id === img.id).folder = 'tool';
  state.tables.site_images.find((d) => d._id === img.id).size = lib.TOOL_IMAGE_MAX_BYTES + 1;
  assert.equal((await put({ tool_key: 'pets', site_image_id: img.id, alt: 'a' })).status, 413);
  assert.equal((await route.DELETE(req(true, { tool_key: 'bogus' }))).status, 400);
  assert.equal((state.tables.tool_images || []).length, 0);
});

test('fails open to default icons when Mongo is down (public map, public route)', async () => {
  serverMod.invalidateToolImages();
  state.fail = true;
  assert.deepEqual(await serverMod.getToolImageMap(), {});
  const res = await publicRoute.GET();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).images, {});
  assert.equal((await route.GET(req(true))).status, 503);
  state.fail = false;
});

test('cache holds for the TTL, serves stale on loader failure, and invalidates', async () => {
  let t = 0; let n = 0; let boom = false;
  const cache = lib.createOverrideCache(async () => { if (boom) throw new Error('x'); n += 1; return { n }; }, { ttl: 30_000, now: () => t });
  assert.deepEqual(await cache.get(), { n: 1 });
  t = 29_000; assert.deepEqual(await cache.get(), { n: 1 });
  t = 31_000; assert.deepEqual(await cache.get(), { n: 2 });
  boom = true; t = 70_000; assert.deepEqual(await cache.get(), { n: 2 }, 'stale on failure');
  cache.invalidate(); assert.deepEqual(await cache.get(), {}, 'fails open when nothing cached');
});

test('tile resolution: override replaces the default, otherwise null (built-in icon)', () => {
  const map = lib.overridesToMap([
    { tool_key: 'pets', site_image_id: '11111111-1111-4111-8111-111111111111', alt: 'Pets' },
    { tool_key: 'ghost', site_image_id: '11111111-1111-4111-8111-111111111111', alt: 'x' },
    { tool_key: 'charms', site_image_id: 'bad-id', alt: 'x' },
  ]);
  assert.deepEqual(Object.keys(map), ['pets']);
  assert.equal(lib.resolveToolImage(map, 'pets').url, '/api/site-image/11111111-1111-4111-8111-111111111111');
  assert.equal(lib.resolveToolImage(map, 'charms'), null);
  assert.equal(lib.resolveToolImage(map, 'hasOwnProperty'), null);
  assert.ok(lib.isToolKey('hero-gear') && !lib.isToolKey('x'));
});
