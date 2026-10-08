import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';

const state = { tables: {}, fail: false };
globalThis.__helpImgTest = state;
registerHooks({
  resolve(s, c, next) {
    { const r = driveHookResolve(s, c, next); if (r) return r; }
    if (/\/helpImages\.server$/.test(s)) return next(s + '.js', c);
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:hi-mongo', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(adminAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    { const l = driveHookLoad(u); if (l) return l; }
    if (u === 'test:hi-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; const m=createFakeMongo(globalThis.__helpImgTest.tables); export const getCollection=async(n)=>{ if(globalThis.__helpImgTest.fail) throw new Error('mongo down'); return m.getCollection(n); }; export const ensureIndexes=m.ensureIndexes;` };
    }
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'help-images-test-only';
const route = await import('../app/api/admin-help-images/route.js');
const imagesRoute = await import('../app/api/admin-drive/images/route.js');
const serverMod = await import('../lib/helpImages.server.js');
const lib = await import('../lib/helpImages.mjs');
const { HELP_SECTIONS, chunkRows, isHelpSectionId } = await import('../lib/helpSections.mjs');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');
const token = await mintAdminToken();
const req = (admin, body = {}, url = 'http://localhost/api/admin-help-images') => ({
  url, headers: new Headers(), cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: token } : undefined) },
  json: async () => body, formData: async () => body,
});
setDriveStorageFactory(() => tmpFakeDriveInstance);
const tmpFakeDriveInstance = await tmpFakeDrive();

async function upload(name = 'a.png') {
  const form = new FormData();
  form.set('folder', 'help'); form.set('alt', 'x'); form.set('file', new File([PNG], name, { type: 'image/png' }));
  const res = await imagesRoute.POST(req(true, form));
  assert.equal(res.status, 201);
  return (await res.json()).image;
}


test('every help-images admin route rejects anonymous callers', async () => {
  for (const call of [() => route.GET(req(false)), () => route.PUT(req(false, { section_id: 'what' })), () => route.DELETE(req(false, { section_id: 'what' }))]) {
    assert.equal((await call()).status, 401);
  }
});

test('set, replace, list and remove a help image; caption and side are kept', async () => {
  const one = await upload('one.png'); const two = await upload('two.png');
  let res = await route.PUT(req(true, { section_id: 'join', site_image_id: one.id, alt: 'Apply button', caption: ' Step one ', side: 'left' }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).image.url, `/api/site-image/${one.id}`);
  res = await route.PUT(req(true, { section_id: 'join', site_image_id: two.id, alt: 'New', side: 'right' }));
  assert.equal(res.status, 200);
  assert.equal(state.tables.help_section_images.length, 1, 'one row per section');
  const list = (await (await route.GET(req(true))).json()).sections;
  assert.equal(list.length, HELP_SECTIONS.length);
  const join = list.find((s) => s.id === 'join');
  assert.equal(join.image.url, `/api/site-image/${two.id}`);
  assert.equal(join.image.side, 'right');
  assert.equal(list.find((s) => s.id === 'what').image, null);
  assert.doesNotMatch(JSON.stringify(list), /drive_file_id/);
  assert.equal((await serverMod.getHelpImageMap()).join.alt, 'New', 'admin write invalidates the 30s cache');
  assert.equal((await route.DELETE(req(true, { section_id: 'join' }))).status, 200);
  assert.equal((await route.DELETE(req(true, { section_id: 'join' }))).status, 200, 'idempotent');
  assert.deepEqual(await serverMod.getHelpImageMap(), {});
});

test('unknown section, missing alt, bad side, bad ids and non-help images are rejected', async () => {
  const img = await upload('v.png');
  const put = (b) => route.PUT(req(true, b));
  const ok = { section_id: 'ask', site_image_id: img.id, alt: 'a' };
  assert.equal((await put({ ...ok, section_id: 'not-a-section' })).status, 400);
  assert.equal((await put({ ...ok, section_id: '__proto__' })).status, 400);
  assert.equal((await put({ ...ok, alt: '   ' })).status, 400);
  assert.equal((await put({ ...ok, side: 'top' })).status, 400);
  assert.equal((await put({ ...ok, site_image_id: 'nope' })).status, 400);
  assert.equal((await put({ ...ok, site_image_id: '11111111-1111-4111-8111-111111111111' })).status, 400);
  state.tables.site_images.find((d) => d._id === img.id).folder = 'tool';
  assert.equal((await put(ok)).status, 400, 'an image uploaded for another area is refused');
  state.tables.site_images.find((d) => d._id === img.id).folder = 'help';
  state.tables.site_images.find((d) => d._id === img.id).size = lib.HELP_IMAGE_MAX_BYTES + 1;
  assert.equal((await put(ok)).status, 413);
  assert.equal((await route.DELETE(req(true, { section_id: 'bogus' }))).status, 400);
  assert.equal((state.tables.help_section_images || []).length, 0);
});

test('side defaults to right; validate trims and clips text', () => {
  const clean = lib.validateHelpImageInput({ section_id: 'what', site_image_id: '11111111-1111-4111-8111-111111111111', alt: `  ${'x'.repeat(300)} `, caption: 'c'.repeat(400) });
  assert.equal(clean.side, 'right');
  assert.equal(clean.alt.length, 240);
  assert.equal(clean.caption.length, 300);
  assert.throws(() => lib.validateHelpImageInput({ section_id: 'what', site_image_id: 'x', alt: 'a' }), lib.HelpImageError);
});

test('fails open to text only when Mongo is down (public map); admin sees a plain error', async () => {
  serverMod.invalidateHelpImages();
  state.fail = true;
  assert.deepEqual(await serverMod.getHelpImageMap(), {});
  assert.equal((await route.GET(req(true))).status, 503);
  state.fail = false;
});

test('cache holds for the TTL, serves stale on loader failure, and invalidates', async () => {
  let n = 0; let t = 0; let fail = false;
  const cache = lib.createHelpImageCache(async () => { n += 1; if (fail) throw new Error('x'); return { a: n }; }, { ttl: 100, now: () => t });
  assert.deepEqual(await cache.get(), { a: 1 });
  t = 50; assert.deepEqual(await cache.get(), { a: 1 });
  t = 150; fail = true; assert.deepEqual(await cache.get(), { a: 1 }, 'stale on failure');
  fail = false; cache.invalidate(); assert.deepEqual(await cache.get(), { a: 3 });
});

test('planHelpSections: with/without image, side, unusable rows ignored', () => {
  const map = lib.helpImagesToMap([
    { section_id: 'what', site_image_id: '11111111-1111-4111-8111-111111111111', alt: 'A', side: 'left', width: 800, height: 600 },
    { section_id: 'join', site_image_id: 'bad-id', alt: 'B' },
    { section_id: 'nope', site_image_id: '11111111-1111-4111-8111-111111111111', alt: 'C' },
  ]);
  const plan = lib.planHelpSections(HELP_SECTIONS, map);
  assert.equal(plan.length, HELP_SECTIONS.length);
  assert.equal(plan[0].layout, 'two-col-left');
  assert.equal(plan[0].image.width, 800);
  assert.equal(plan[1].layout, 'single');
  assert.equal(plan[1].image, null);
  assert.equal(lib.planHelpSections(HELP_SECTIONS, undefined).every((s) => s.layout === 'single'), true);
});

test('help sections: ids unique, titles set, grid rows of three', () => {
  assert.equal(new Set(HELP_SECTIONS.map((s) => s.id)).size, HELP_SECTIONS.length);
  assert.equal(HELP_SECTIONS.length, 9);
  assert.ok(HELP_SECTIONS.every((s) => s.title.length > 3));
  assert.equal(isHelpSectionId('what'), true);
  assert.equal(isHelpSectionId('toString'), false);
  const rows = chunkRows(HELP_SECTIONS);
  assert.deepEqual(rows.map((r) => r.length), [3, 3, 3]);
  assert.deepEqual(chunkRows([1, 2, 3, 4, 5]).map((r) => r.length), [3, 2]);
  assert.deepEqual(chunkRows([]), []);
});
