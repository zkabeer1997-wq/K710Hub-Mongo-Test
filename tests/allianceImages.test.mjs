import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';
import { mintAdminToken } from '../lib/adminAuth.js';
import {
  ALLIANCE_IMAGE_ASPECT, ALLIANCE_IMAGE_HEIGHT, ALLIANCE_IMAGE_WIDTH, allianceImageUrl, checkAllianceImage, parseAllianceImageFields, releaseAllianceImage,
} from '../lib/allianceImages.mjs';
import { coverCropRect, squareCropRect } from '../lib/squareCrop.mjs';
import { SITE_FOLDERS, SITE_FOLDER_KINDS } from '../lib/driveFolders.mjs';
import { PUBLIC_SITE_FOLDERS, withoutPlaceholder } from '../lib/siteImages.mjs';
import { placeholderResponse } from '../lib/galleryImageDelivery.mjs';

const state = { tables: { alliances: [], site_images: [], guides: [] }, paths: [] };
globalThis.__allianceImagesTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    { const r = driveHookResolve(specifier, context, nextResolve); if (r) return r; }
    if (/\/mongo(\.js)?$/.test(specifier)) return { url: 'test:ai-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:ai-cache', shortCircuit: true };
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (/\/(adminAuth|mongoCollections|memberAuth|bearHuntSchedule|publicBearSchedule|publicAllianceEvents|revalidateAlliancePages|pageText\.server|alliancesPublic\.server)$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    { const l = driveHookLoad(url); if (l) return l; }
    if (url === 'test:ai-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__allianceImagesTest.tables, { alliances: ['tag'] });` };
    }
    if (url === 'test:ai-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = (...args) => globalThis.__allianceImagesTest.paths.push(args);' };
    return nextLoad(url, context);
  },
});
const { POST } = await import('../app/api/admin-alliances/route.js');
const { PUT, DELETE } = await import('../app/api/admin-alliances/[tag]/route.js');
const { loadLandingAlliances, loadAllianceByTag } = await import('../lib/alliancesPublic.server.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const imagesRoute = await import('../app/api/admin-drive/images/route.js');
const fakeDrive = await tmpFakeDrive();
setDriveStorageFactory(() => fakeDrive);
process.env.ADMIN_PASSWORD = 'alliance-images-test-only';
const token = await mintAdminToken();
const request = (body, url = 'http://localhost/api/x') => ({ url, headers: new Headers(), cookies: { get: () => ({ value: token }) }, json: async () => body, formData: async () => body });
const params = (tag) => ({ params: Promise.resolve({ tag }) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_HERO = '33333333-3333-4333-8333-333333333333';
const base = { name: 'Zenzen', recruiting_status: 'open' };

function reset() {
  state.tables.alliances.length = 0; state.tables.site_images.length = 0;
  state.tables.site_images.push({ _id: ID_A, folder: 'alliance' }, { _id: ID_B, folder: 'alliance' }, { _id: ID_HERO, folder: 'hero' });
}

test('folder kind: Alliance images exists and is public-servable', () => {
  assert.equal(SITE_FOLDERS.alliance, 'Alliance images');
  assert.ok(SITE_FOLDER_KINDS.includes('alliance'));
  assert.ok(PUBLIC_SITE_FOLDERS.includes('alliance'));
});

test('16:9 crop geometry: centred, never exceeds the image, square helper unchanged', () => {
  assert.equal(Math.abs(ALLIANCE_IMAGE_ASPECT - 16 / 9) < 1e-9, true);
  assert.equal(ALLIANCE_IMAGE_WIDTH / ALLIANCE_IMAGE_HEIGHT, 16 / 9);
  assert.deepEqual(coverCropRect(1600, 900, 16 / 9), { sx: 0, sy: 0, sw: 1600, sh: 900 });
  // tall portrait: full width, centred band
  assert.deepEqual(coverCropRect(1000, 2000, 16 / 9), { sx: 0, sy: Math.floor((2000 - 563) / 2), sw: 1000, sh: 563 });
  // ultra-wide: full height, centred slice
  assert.deepEqual(coverCropRect(3000, 900, 16 / 9), { sx: 700, sy: 0, sw: 1600, sh: 900 });
  for (const [w, h] of [[800, 450], [1234, 777], [4000, 4000], [801, 2000]]) {
    const r = coverCropRect(w, h, 16 / 9);
    assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= w && r.sy + r.sh <= h, `${w}x${h}`);
    assert.ok(Math.abs(r.sw / r.sh - 16 / 9) < 0.01, `${w}x${h} ratio`);
  }
  assert.deepEqual(squareCropRect(800, 600), { sx: 100, sy: 0, side: 600 });
});

test('image field parsing: omitted stays omitted, empty clears, bad ids are refused', () => {
  assert.deepEqual(parseAllianceImageFields({ name: 'x' }), { fields: {} });
  assert.deepEqual(parseAllianceImageFields({ image_id: ID_A, image_alt: '  A view  ' }).fields, { image_id: ID_A, image_alt: 'A view' });
  assert.deepEqual(parseAllianceImageFields({ image_id: '', image_alt: 'stale' }).fields, { image_id: '', image_alt: '' });
  assert.deepEqual(parseAllianceImageFields({ image_id: null }).fields, { image_id: '', image_alt: '' });
  assert.equal(parseAllianceImageFields({ image_alt: 'x'.repeat(500) }).fields.image_alt.length, 240);
  for (const bad of ['nope', '../../etc', 12, {}, ID_A + 'x']) assert.ok(parseAllianceImageFields({ image_id: bad }).error, String(bad));
});

test('public url uses the strict no-placeholder query and rejects bad ids', () => {
  assert.equal(allianceImageUrl(ID_A), `/api/site-image/${ID_A}?fallback=none`);
  assert.equal(allianceImageUrl(''), '');
  assert.equal(allianceImageUrl('../x'), '');
  assert.equal(allianceImageUrl(undefined), '');
  // a failed photo answers an error status with no body, so onError can swap to the no-photo look
  assert.equal(withoutPlaceholder(placeholderResponse(404), true).status, 404);
  assert.equal(withoutPlaceholder(placeholderResponse(404), true).headers.get('content-type'), null);
});

test('checkAllianceImage: ok / missing / wrong folder', async () => {
  reset();
  const coll = { findOne: async (q) => state.tables.site_images.find((d) => d._id === q._id) || null };
  assert.equal(await checkAllianceImage(coll, ID_A), 'ok');
  assert.equal(await checkAllianceImage(coll, ID_HERO), 'wrong-folder');
  assert.equal(await checkAllianceImage(coll, '44444444-4444-4444-8444-444444444444'), 'missing');
});

test('admin POST stores a valid photo, rejects another folder, drops a vanished one with a warning', async () => {
  reset();
  let res = await POST(request({ ...base, tag: 'ZZ1', image_id: ID_A, image_alt: 'Fortress at dusk' }));
  assert.equal(res.status, 200);
  assert.equal(state.tables.alliances[0].image_id, ID_A);
  assert.equal(state.tables.alliances[0].image_alt, 'Fortress at dusk');
  res = await POST(request({ ...base, tag: 'ZZ2', image_id: ID_HERO }));
  assert.equal(res.status, 400);
  res = await POST(request({ ...base, tag: 'ZZ3', image_id: 'garbage' }));
  assert.equal(res.status, 400);
  res = await POST(request({ ...base, tag: 'ZZ4', image_id: '55555555-5555-4555-8555-555555555555' }));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).warning);
  assert.equal(state.tables.alliances.find((a) => a.tag === 'ZZ4').image_id, undefined);
  res = await POST(request({ ...base, tag: 'ZZ5' }));
  assert.equal(Object.hasOwn(state.tables.alliances.find((a) => a.tag === 'ZZ5'), 'image_id'), false);
});

test('admin PUT: omitting image_id keeps the photo, empty clears it, replacing releases the old one only when unused', async () => {
  reset();
  state.tables.alliances.push({ tag: 'AA', name: 'A', active: true, image_id: ID_A, image_alt: 'old' }, { tag: 'BB', name: 'B', active: true, image_id: ID_A });
  let res = await PUT(request({ blurb: 'text only' }), params('AA'));
  assert.equal(res.status, 200);
  assert.equal(state.tables.alliances[0].image_id, ID_A, 'old client must not clear the photo');
  // AA moves to B-photo; ID_A still used by BB so it must stay in site_images
  res = await PUT(request({ image_id: ID_B }), params('AA'));
  assert.equal(res.status, 200);
  assert.equal(state.tables.alliances[0].image_id, ID_B);
  assert.ok(state.tables.site_images.some((d) => d._id === ID_A), 'still used by BB');
  res = await PUT(request({ image_id: '' }), params('BB'));
  assert.equal(res.status, 200);
  assert.equal(state.tables.alliances[1].image_id, '');
  assert.equal(state.tables.alliances[1].image_alt, '');
  res = await PUT(request({ image_id: ID_HERO }), params('AA'));
  assert.equal(res.status, 400);
  res = await PUT(request({ image_id: 'bad id' }), params('AA'));
  assert.equal(res.status, 400);
  assert.equal(state.tables.alliances[0].image_id, ID_B);
});

test('releaseAllianceImage only removes a photo no alliance uses and never throws', async () => {
  const removed = [];
  const alliances = { findOne: async (q) => (q.image_id === ID_A ? { tag: 'X' } : null) };
  assert.equal(await releaseAllianceImage({ alliances, imageId: ID_A, removeImage: async (id) => removed.push(id) }), false);
  assert.equal(await releaseAllianceImage({ alliances, imageId: ID_B, removeImage: async (id) => { removed.push(id); return true; } }), true);
  assert.deepEqual(removed, [ID_B]);
  assert.equal(await releaseAllianceImage({ alliances, imageId: ID_B, removeImage: async () => { throw new Error('drive down'); } }), false);
  assert.equal(await releaseAllianceImage({ alliances, imageId: 'bad', removeImage: async () => true }), false);
});

test('admin DELETE of an alliance does not fail on photo cleanup', async () => {
  reset();
  state.tables.alliances.push({ tag: 'DD', name: 'D', active: true, image_id: ID_A });
  const res = await DELETE(request(), params('DD'));
  assert.equal(res.status, 200);
  assert.equal(state.tables.alliances.length, 0);
});

test('public loaders return the photo url and description; no photo gives an empty url', async () => {
  reset();
  state.tables.alliances.push(
    { tag: '710', name: 'Z', active: true, sort_order: 1, image_id: ID_A, image_alt: 'Castle', recruiting_status: 'open' },
    { tag: 'RED', name: 'R', active: true, sort_order: 2, recruiting_status: 'open' },
    { tag: 'SKY', name: 'S', active: true, sort_order: 3, image_id: 'not-valid', recruiting_status: 'open' },
  );
  const list = await loadLandingAlliances();
  const by = Object.fromEntries(list.map((a) => [a.tag, a]));
  assert.equal(by['710'].image_url, `/api/site-image/${ID_A}?fallback=none`);
  assert.equal(by['710'].image_alt, 'Castle');
  assert.equal(by.RED.image_url, '');
  assert.equal(by.SKY.image_url, '', 'an invalid stored id never becomes a url');
  const one = await loadAllianceByTag('710');
  assert.equal(one.image_url, `/api/site-image/${ID_A}?fallback=none`);
});

test('upload route accepts the alliance folder and caps it at 2 MB', async () => {
  const form = new Map([['folder', 'alliance'], ['file', new File([PNG], 'a.png', { type: 'image/png' })]]);
  form.entries = form.entries.bind(form);
  const ok = await imagesRoute.POST({ ...request(form), headers: new Headers() });
  assert.equal(ok.status, 201);
  const big = new Map([['folder', 'alliance'], ['file', new File([Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])], 'big.png', { type: 'image/png' })]]);
  const rej = await imagesRoute.POST({ ...request(big), headers: new Headers() });
  assert.ok(rej.status >= 400 && rej.status < 500, `big upload refused (${rej.status})`);
});
