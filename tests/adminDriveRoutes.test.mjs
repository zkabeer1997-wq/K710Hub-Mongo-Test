import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';

const state = { tables: {}, paths: [] };
globalThis.__adminDriveTest = state;
registerHooks({
  resolve(s, c, next) {
    { const r = driveHookResolve(s, c, next); if (r) return r; }
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ad-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:ad-cache', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(adminAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    { const l = driveHookLoad(u); if (l) return l; }
    if (u === 'test:ad-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__adminDriveTest.tables);` };
    }
    if (u === 'test:ad-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=(...a)=>globalThis.__adminDriveTest.paths.push(a);' };
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'admin-drive-test-only';
const pickerRoute = await import('../app/api/admin-drive/picker-config/route.js');
const statusRoute = await import('../app/api/admin-drive/status/route.js');
const imagesRoute = await import('../app/api/admin-drive/images/route.js');
const fakeFilesRoute = await import('../app/api/admin-drive/fake-files/route.js');
const siteImageRoute = await import('../app/api/site-image/[id]/route.js');
const galleryRoute = await import('../app/api/admin-gallery/route.js');
const guideUpload = await import('../app/api/admin-guide-images/route.js');
const guideServe = await import('../app/api/guide-images/[file]/route.js');
const guideMigrate = await import('../app/api/admin-guide-images/migrate/route.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');
const token = await mintAdminToken();
const as = (admin, body = {}, url = 'http://localhost/api/x', headers = {}) => ({
  url, headers: new Headers(headers), cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: token } : undefined) },
  json: async () => body, formData: async () => body,
});
const drive = await tmpFakeDrive();
setDriveStorageFactory(() => drive);
const png = (name = 'p.png') => new File([PNG], name, { type: 'image/png' });

test('every new admin-drive route rejects anonymous callers', async () => {
  const body = new FormData();
  for (const call of [
    () => pickerRoute.GET(as(false)), () => statusRoute.GET(as(false)), () => fakeFilesRoute.GET(as(false)),
    () => imagesRoute.POST(as(false, body)), () => imagesRoute.DELETE(as(false, {}, 'http://localhost/api/admin-drive/images?id=x')),
    () => guideMigrate.POST(as(false)),
  ]) assert.equal((await call()).status, 401);
});

test('picker-config (fake Drive) is admin-only, no-store and contains no refresh token', async () => {
  const res = await pickerRoute.GET(as(true));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { configured: true, fake: true, connected: true });
  assert.doesNotMatch(text, /refresh/i);
});

test('picker-config (real client shape): missing env explains setup; configured env returns only token, key and app id', async () => {
  const real = { fake: false, getStatus: async () => ({ connected: true }), getAccessToken: async () => 'ya29.short' };
  setDriveStorageFactory(() => real);
  delete process.env.GOOGLE_PICKER_API_KEY; delete process.env.GOOGLE_PICKER_APP_ID;
  let body = await (await pickerRoute.GET(as(true))).json();
  assert.equal(body.message, 'Google Picker is not set up yet');
  assert.ok(!('accessToken' in body));
  process.env.GOOGLE_PICKER_API_KEY = 'AIza-test'; process.env.GOOGLE_PICKER_APP_ID = '1234567890';
  const res = await pickerRoute.GET(as(true));
  body = await res.json();
  assert.deepEqual(body, { configured: true, connected: true, accessToken: 'ya29.short', developerKey: 'AIza-test', appId: '1234567890' });
  delete process.env.GOOGLE_PICKER_API_KEY; delete process.env.GOOGLE_PICKER_APP_ID;
  real.getStatus = async () => ({ connected: false });
  assert.equal((await pickerRoute.GET(as(true))).status, 409);
  setDriveStorageFactory(() => drive);
});

test('shared ImageUploadField endpoint: upload from computer and copy a picked file, both stored in Drive', async () => {
  const form = new FormData(); form.set('folder', 'hero'); form.set('alt', 'Hero art'); form.set('file', png('hero.png'));
  const up = await imagesRoute.POST(as(true, form));
  assert.equal(up.status, 201);
  const { image } = await up.json();
  assert.match(image.url, /^\/api\/site-image\/[0-9a-f-]{36}$/);
  assert.ok(!JSON.stringify(image).includes('drive_file_id'));
  const row = state.tables.site_images.find((r) => String(r._id) === image.id);
  assert.equal(row.folder, 'hero');
  assert.ok(!JSON.stringify(row).includes('base64'));

  const outside = await drive.uploadFile({ name: 'picked.png', mimeType: 'image/png', bytes: PNG, folderId: await drive.findOrCreateFolder('Picker source') });
  const pick = await imagesRoute.POST(as(true, { folder: 'tool', driveFileId: outside.id, alt: 'Tool' }, 'http://localhost/api/x', { 'content-type': 'application/json' }));
  assert.equal(pick.status, 201);
  const picked = (await pick.json()).image;
  const pickedRow = state.tables.site_images.find((r) => String(r._id) === picked.id);
  assert.notEqual(pickedRow.drive_file_id, outside.id, 'copied, not referenced');

  const bad = await imagesRoute.POST(as(true, { folder: 'application', driveFileId: outside.id }, 'http://localhost/api/x', { 'content-type': 'application/json' }));
  assert.equal(bad.status, 400);
  const noAccess = await imagesRoute.POST(as(true, { folder: 'hero', driveFileId: 'nope-nope-nope' }, 'http://localhost/api/x', { 'content-type': 'application/json' }));
  assert.equal(noAccess.status, 403);
  assert.match((await noAccess.json()).error, /Choose from Drive/);

  // public proxy
  const served = await siteImageRoute.GET(as(false), { params: Promise.resolve({ id: image.id }) });
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
  const del = await imagesRoute.DELETE(as(true, {}, `http://localhost/api/admin-drive/images?id=${image.id}`));
  assert.equal(del.status, 200);
  assert.equal((await siteImageRoute.GET(as(false), { params: Promise.resolve({ id: image.id }) })).status, 404);
});

test('gallery upload from this computer: Drive only, no base64; and via a picked Drive file', async () => {
  const form = new FormData();
  form.set('file', png('g.png')); form.set('alt_text', 'A gallery picture'); form.set('title', 'T'); form.set('position', '1');
  const res = await galleryRoute.POST(as(true, form));
  assert.equal(res.status, 201);
  const { image } = await res.json();
  assert.match(image.image_url, /^\/api\/gallery\/image\//);
  const row = state.tables.gallery_images.at(-1);
  assert.equal(row.storage, 'drive');
  assert.ok(row.drive_file_id);
  assert.equal(row.image_url, undefined);
  assert.ok(!JSON.stringify(row).includes('base64'));
  assert.equal(state.tables.site_images.find((r) => String(r._id) === row.site_image_id).folder, 'gallery');

  const src = await drive.uploadFile({ name: 'mine.png', mimeType: 'image/png', bytes: PNG, folderId: await drive.findOrCreateFolder('Picker source') });
  const form2 = new FormData();
  form2.set('drive_file_id', src.id); form2.set('alt_text', 'Picked picture'); form2.set('position', '2');
  const res2 = await galleryRoute.POST(as(true, form2));
  assert.equal(res2.status, 201);
  const row2 = state.tables.gallery_images.at(-1);
  assert.notEqual(row2.drive_file_id, src.id);
  assert.equal(row2.alt_text, 'Picked picture');
  const noAlt = new FormData(); noAlt.set('drive_file_id', src.id);
  assert.equal((await galleryRoute.POST(as(true, noAlt))).status, 400);
  const nothing = new FormData(); nothing.set('alt_text', 'x');
  assert.equal((await galleryRoute.POST(as(true, nothing))).status, 400);
});

test('gallery refuses cleanly when Drive is not connected (no database fallback for admin uploads)', async () => {
  setDriveStorageFactory(() => ({ fake: false, getStatus: async () => ({ connected: false }) }));
  const form = new FormData(); form.set('file', png()); form.set('alt_text', 'x');
  const res = await galleryRoute.POST(as(true, form));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).needsConnect, true);
  setDriveStorageFactory(() => drive);
});

test('guide images: desktop upload and Drive pick both land in Guides images; public proxy streams with long cache; legacy base64 still works and migrates', async () => {
  const form = new FormData(); form.set('file', png('guide.png')); form.set('guide', 'my-guide');
  const up = await guideUpload.POST(as(true, form));
  assert.equal(up.status, 201);
  const { src } = await up.json();
  const file = src.split('/').pop();
  const served = await guideServe.GET(as(false), { params: Promise.resolve({ file }) });
  assert.equal(served.status, 200);
  assert.match(served.headers.get('cache-control'), /max-age=31536000, immutable/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
  const etag = served.headers.get('etag');
  const notModified = await guideServe.GET({ ...as(false), headers: new Headers({ 'if-none-match': etag }) }, { params: Promise.resolve({ file }) });
  assert.equal(notModified.status, 304);

  const picked = await drive.uploadFile({ name: 'p.png', mimeType: 'image/png', bytes: PNG, folderId: await drive.findOrCreateFolder('Picker source') });
  const pickRes = await guideUpload.POST(as(true, { driveFileId: picked.id, guide: 'my-guide' }, 'http://localhost/api/x', { 'content-type': 'application/json' }));
  assert.equal(pickRes.status, 201);
  assert.equal(state.tables.guide_attachments.filter((r) => r.storage === 'drive').length, 2);

  const legacyFile = '22222222-2222-4222-8222-222222222222.png';
  state.tables.guide_attachments.push({ path: legacyFile, content_type: 'image/png', data_url: `data:image/png;base64,${PNG.toString('base64')}`, guide: 'my-guide', created_at: new Date() });
  const legacyServed = await guideServe.GET(as(false), { params: Promise.resolve({ file: legacyFile }) });
  assert.equal(legacyServed.status, 200);
  assert.deepEqual(Buffer.from(await legacyServed.arrayBuffer()), PNG);

  const dry = await (await guideMigrate.POST(as(true, { dryRun: true }))).json();
  assert.equal(dry.legacyCount, 1);
  const mig = await (await guideMigrate.POST(as(true, {}))).json();
  assert.deepEqual(mig.migrated, [legacyFile]);
  const after = state.tables.guide_attachments.find((r) => r.path === legacyFile);
  assert.equal(after.data_url, undefined);
  assert.ok(after.drive_file_id);
  const again = await guideServe.GET(as(false), { params: Promise.resolve({ file: legacyFile }) });
  assert.deepEqual(Buffer.from(await again.arrayBuffer()), PNG);
  assert.equal((await (await guideMigrate.POST(as(true, {}))).json()).migrated.length, 0, 'idempotent');
  assert.equal((await guideServe.GET(as(false), { params: Promise.resolve({ file: '../etc/passwd' }) })).status, 404);
});
