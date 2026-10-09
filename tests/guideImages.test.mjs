import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';
import { mintAdminToken } from '../lib/adminAuth.js';
import { validateDraft, validateGuide, GUIDE_FIELDS } from '../lib/guideValidation.mjs';
import { guideCardImageUrl, guideImageExists, releaseGuideImage } from '../lib/guideImages.mjs';
import { squareCropRect } from '../lib/squareCrop.mjs';
import { withoutPlaceholder } from '../lib/siteImages.mjs';
import { placeholderResponse } from '../lib/galleryImageDelivery.mjs';

const state = { tables: { kingdom_guides: [], site_images: [] }, paths: [] };
globalThis.__guideImagesTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    { const r = driveHookResolve(specifier, context, nextResolve); if (r) return r; }
    if (/\/mongo(\.js)?$/.test(specifier)) return { url: 'test:gi-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:gi-cache', shortCircuit: true };
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (/\/(adminAuth|mongoCollections|memberAuth)$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    { const l = driveHookLoad(url); if (l) return l; }
    if (url === 'test:gi-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__guideImagesTest.tables, { kingdom_guides: ['slug'] });` };
    }
    if (url === 'test:gi-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = (...args) => globalThis.__guideImagesTest.paths.push(args);' };
    return nextLoad(url, context);
  },
});
const { PUT, GET, DELETE } = await import('../app/api/admin-guides/[slug]/route.js');
const { POST: createGuide, GET: listGuides } = await import('../app/api/admin-guides/route.js');
const { PUT: draftPut } = await import('../app/api/admin-guides/[slug]/draft/route.js');
const imagesRoute = await import('../app/api/admin-drive/images/route.js');
const siteImageRoute = await import('../app/api/site-image/[id]/route.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const fakeDrive = await tmpFakeDrive();
setDriveStorageFactory(() => fakeDrive);
process.env.ADMIN_PASSWORD = 'guide-images-test-only';
const token = await mintAdminToken();
const request = (body, authenticated = true, url = 'http://localhost/api/x', headers = {}) => ({ url, headers: new Headers(headers), cookies: { get: () => (authenticated ? { value: token } : undefined) }, json: async () => body, formData: async () => body });
const params = (slug) => ({ params: Promise.resolve({ slug }) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const meta = { slug: 'qa-test-pic', title: 'Picture guide', category: 'Cat', description: 'd', position: 1, access_level: 'public', body: 'text' };

test('image_id is optional, validated by the site image id pattern, and only written when sent', () => {
  assert.ok(GUIDE_FIELDS.includes('image_id'));
  assert.equal(Object.hasOwn(validateGuide(meta).guide, 'image_id'), false, 'an old client must not wipe the picture');
  assert.equal(validateGuide({ ...meta, image_id: ID_A }).guide.image_id, ID_A);
  assert.equal(validateGuide({ ...meta, image_id: '' }).guide.image_id, '');
  assert.equal(validateGuide({ ...meta, image_id: null }).guide.image_id, '');
  assert.match(validateGuide({ ...meta, image_id: '../../etc/passwd' }).error, /picture/i);
  assert.equal(validateGuide({ ...meta, image_id: { $ne: 1 } }).guide.image_id, '', 'operator objects never reach the database');
});

test('the autosave draft keeps a valid picture id and blanks anything else', () => {
  const layout = { version: 1, template: 'sidebar-right', areas: { main: [], sidebar: [] } };
  assert.equal(validateDraft({ layout, image_id: ID_A }).draft.image_id, ID_A);
  assert.equal(validateDraft({ layout, image_id: 'nope' }).draft.image_id, '');
  assert.equal(validateDraft({ layout }).draft.image_id, '');
});

test('card url: same-origin, no Drive ids, error status instead of the placeholder; no picture means no url', () => {
  assert.equal(guideCardImageUrl(ID_A), `/api/site-image/${ID_A}?fallback=none`);
  for (const bad of ['', undefined, null, 'x', { $ne: 1 }]) assert.equal(guideCardImageUrl(bad), '');
});

test('strict image responses drop the placeholder body so <img> raises onError', async () => {
  const placeholder = placeholderResponse(502);
  assert.match(placeholder.headers.get('content-type'), /svg/);
  const strict = withoutPlaceholder(placeholderResponse(404), true);
  assert.equal(strict.status, 404);
  assert.equal(strict.headers.get('content-type'), null);
  assert.equal(await strict.text(), '');
  assert.equal(withoutPlaceholder(placeholderResponse(404), false).headers.get('content-type'), 'image/svg+xml');
  const ok = new Response('img', { status: 200 });
  assert.equal(withoutPlaceholder(ok, true), ok);
});

test('square crop takes the centred square', () => {
  assert.deepEqual(squareCropRect(1000, 600), { sx: 200, sy: 0, side: 600 });
  assert.deepEqual(squareCropRect(600, 1001), { sx: 0, sy: 200, side: 600 });
  assert.deepEqual(squareCropRect(512, 512), { sx: 0, sy: 0, side: 512 });
});

test('guideImageExists only accepts pictures from the guides folder', async () => {
  const coll = { findOne: async ({ _id }) => ({ [ID_A]: { folder: 'guide' }, [ID_B]: { folder: 'hero' } })[_id] || null };
  assert.equal(await guideImageExists(coll, ID_A), true);
  assert.equal(await guideImageExists(coll, ID_B), false);
  assert.equal(await guideImageExists(coll, 'missing'), false);
  assert.equal(await guideImageExists(coll, ''), false);
});

test('releaseGuideImage deletes unused pictures, keeps shared ones, and never throws', async () => {
  const removed = [];
  const removeImage = async (id) => { removed.push(id); return true; };
  assert.equal(await releaseGuideImage({ guides: { findOne: async () => null }, imageId: ID_A, removeImage }), true);
  assert.equal(await releaseGuideImage({ guides: { findOne: async () => ({ slug: 'other' }) }, imageId: ID_B, removeImage }), false);
  assert.equal(await releaseGuideImage({ guides: { findOne: async () => null }, imageId: 'bad', removeImage }), false);
  const failing = await releaseGuideImage({ guides: { findOne: async () => null }, imageId: ID_A, removeImage: async () => { throw new Error('Drive down'); } });
  assert.equal(failing, false);
  assert.deepEqual(removed, [ID_A]);
});

async function uploadGuidePicture(bytes = PNG, type = 'image/png') {
  const form = new FormData(); form.set('folder', 'guide'); form.set('file', new File([bytes], 'card.png', { type }));
  const res = await imagesRoute.POST(request(form));
  return { res, body: await res.json() };
}

test('admin upload accepts the guide folder, rejects non-images and oversized files, and requires admin', async () => {
  const { res, body } = await uploadGuidePicture();
  assert.equal(res.status, 201);
  assert.equal(state.tables.site_images.find((r) => String(r._id) === body.image.id).folder, 'guide');
  const notImage = await uploadGuidePicture(Buffer.from('not an image at all'));
  assert.equal(notImage.res.status, 415);
  const big = await uploadGuidePicture(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
  assert.equal(big.res.status, 413);
  assert.match(big.body.error, /2 MB/);
  const anonymous = new FormData(); anonymous.set('folder', 'guide');
  assert.equal((await imagesRoute.POST(request(anonymous, false))).status, 401);
});

test('a guide picture round-trips: create, save, admin GET, list, draft, replace and remove', async () => {
  const first = (await uploadGuidePicture()).body.image;
  const second = (await uploadGuidePicture()).body.image;
  assert.equal((await createGuide(request({ ...meta, is_published: false }))).status, 201);

  const saved = await PUT(request({ ...meta, is_published: true, image_id: first.id }), params(meta.slug));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).guide.image_id, first.id);
  assert.equal((await (await GET(request({}), params(meta.slug))).json()).guide.image_id, first.id);
  assert.equal((await (await listGuides(request({}))).json()).guides.find((g) => g.slug === meta.slug).image_id, first.id);

  // Draft path keeps the picture beside the live fields.
  const layout = { version: 1, template: 'sidebar-right', areas: { main: [], sidebar: [] } };
  assert.equal((await draftPut(request({ ...meta, layout, image_id: second.id }), params(meta.slug))).status, 200);
  const withDraft = (await (await GET(request({}), params(meta.slug))).json()).guide;
  assert.equal(withDraft.image_id, first.id);
  assert.equal(withDraft.draft.image_id, second.id);

  // Replacing the picture removes the old Drive file; the new one stays.
  const replaced = await PUT(request({ ...meta, is_published: true, image_id: second.id }), params(meta.slug));
  assert.equal((await replaced.json()).guide.image_id, second.id);
  assert.equal(state.tables.site_images.some((r) => String(r._id) === first.id), false);
  assert.equal(state.tables.site_images.some((r) => String(r._id) === second.id), true);

  // A save from an old client (no image_id key) leaves the picture alone.
  const untouched = await PUT(request({ ...meta, is_published: true, title: 'Renamed' }), params(meta.slug));
  assert.equal((await untouched.json()).guide.image_id, second.id);

  // Clearing it restores the book icon and deletes the file.
  const cleared = await PUT(request({ ...meta, is_published: true, image_id: '' }), params(meta.slug));
  assert.equal((await cleared.json()).guide.image_id, '');
  assert.equal(state.tables.site_images.some((r) => String(r._id) === second.id), false);
});

test('a missing or foreign picture never blocks saving the guide text', async () => {
  const hero = state.tables.site_images.at(-1);
  state.tables.site_images.push({ _id: ID_B, folder: 'hero', drive_file_id: 'x' });
  void hero;
  for (const image_id of [ID_A, ID_B]) {
    const res = await PUT(request({ ...meta, is_published: true, title: `Text kept ${image_id.slice(0, 2)}`, image_id }), params(meta.slug));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.guide.image_id, '');
    assert.match(body.warning, /no longer available/);
    assert.match(body.guide.title, /Text kept/);
  }
  assert.equal((await createGuide(request({ ...meta, slug: 'qa-test-pic-2', is_published: false, image_id: ID_A }))).status, 201);
  assert.equal(state.tables.kingdom_guides.find((g) => g.slug === 'qa-test-pic-2').image_id, '');
  assert.equal((await PUT(request({ ...meta, image_id: 'nope' }), params(meta.slug))).status, 400);
});

test('deleting a guide removes its picture', async () => {
  const pic = (await uploadGuidePicture()).body.image;
  await PUT(request({ ...meta, is_published: true, image_id: pic.id }), params(meta.slug));
  assert.equal((await DELETE(request({}), params(meta.slug))).status, 200);
  assert.equal(state.tables.site_images.some((r) => String(r._id) === pic.id), false);
});

test('site-image route: ?fallback=none turns Drive failures into an error with no image body; normal requests keep the placeholder', async () => {
  const pic = (await uploadGuidePicture()).body.image;
  const row = state.tables.site_images.find((r) => String(r._id) === pic.id);
  const get = (id, query = '') => siteImageRoute.GET({ url: `http://localhost/api/site-image/${id}${query}`, headers: new Headers(), cookies: { get: () => undefined } }, { params: Promise.resolve({ id }) });
  assert.equal((await get(pic.id, '?fallback=none')).status, 200);
  await fakeDrive.trashFile(row.drive_file_id);
  const strict = await get(pic.id, '?fallback=none');
  assert.ok(strict.status >= 400);
  assert.equal(strict.headers.get('content-type'), null);
  const lenient = await get(pic.id);
  assert.ok(lenient.status >= 400);
  assert.equal(lenient.headers.get('content-type'), 'image/svg+xml');
  assert.ok((await get('99999999-9999-4999-8999-999999999999', '?fallback=none')).status === 404);
});
