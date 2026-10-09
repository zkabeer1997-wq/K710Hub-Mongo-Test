import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';
import { mintAdminToken } from '../lib/adminAuth.js';
import { validateDraft, validateGuide, GUIDE_FIELDS } from '../lib/guideValidation.mjs';
import { guideCardImageUrl, guideImageAccess, guideImageExists, releaseGuideImage, visibleCardImageId } from '../lib/guideImages.mjs';
import { guideBodyImageAccess } from '../lib/guideBodyImages.mjs';
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
const bodyImageRoute = await import('../app/api/guide-images/[file]/route.js');
const bodyUpload = await import('../app/api/admin-guide-images/route.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const fakeDrive = await tmpFakeDrive();
setDriveStorageFactory(() => fakeDrive);
process.env.ADMIN_PASSWORD = 'guide-images-test-only';
process.env.GUIDE_IMAGE_ACCESS_TTL_MS = '0';
process.env.MEMBER_SESSION_SECRET = 'guide-images-member-test-only';
const { createMemberToken } = await import('../lib/memberAuth.js');
const memberToken = await createMemberToken('m1');
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
  await createGuide(request({ ...meta, slug: 'qa-test-strict', is_published: true, image_id: pic.id }));
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

test('guideImageAccess: strictest reference wins, unreferenced is admin-only, drafts only tighten', () => {
  const pub = { image_id: ID_A, is_published: true, access_level: 'public' };
  const mem = { image_id: ID_A, is_published: true, access_level: 'members' };
  assert.equal(guideImageAccess([pub], ID_A), 'public');
  assert.equal(guideImageAccess([mem], ID_A), 'members');
  assert.equal(guideImageAccess([pub, mem], ID_A), 'members');
  assert.equal(guideImageAccess([mem, pub], ID_A), 'members');
  assert.equal(guideImageAccess([], ID_A), 'admin');
  assert.equal(guideImageAccess([{ ...pub, is_published: false }], ID_A), 'admin');
  assert.equal(guideImageAccess([{ ...pub, draft: { image_id: ID_A, access_level: 'members' } }], ID_A), 'members');
  assert.equal(guideImageAccess([{ image_id: '', is_published: true, access_level: 'public', draft: { image_id: ID_A, access_level: 'public' } }], ID_A), 'admin');
});

test('listing projection: members-only pictures are never offered to viewers who cannot read the guide', () => {
  const mem = { access_level: 'members', image_id: ID_A };
  assert.equal(visibleCardImageId(mem, { canSeeMembers: false }), '');
  assert.equal(visibleCardImageId(mem, { canSeeMembers: true }), ID_A);
  assert.equal(visibleCardImageId({ access_level: 'public', image_id: ID_A }, { canSeeMembers: false }), ID_A);
  assert.equal(visibleCardImageId({ access_level: 'public' }, {}), '');
});

test('site-image route: members-only guide pictures need a member or admin session; public ones stay public', async () => {
  const cookieReq = (id, who, query = '') => ({
    url: `http://localhost/api/site-image/${id}${query}`, headers: new Headers(),
    cookies: { get: (k) => (who === 'admin' && k === 'tff_admin_session' ? { value: token } : who === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
  });
  const fetchAs = (id, who, query = '') => siteImageRoute.GET(cookieReq(id, who, query), { params: Promise.resolve({ id }) });
  const pic = async () => (await uploadGuidePicture()).body.image.id;
  const publicPic = await pic(); const membersPic = await pic(); const sharedPic = await pic(); const loosePic = await pic();
  await createGuide(request({ ...meta, slug: 'qa-test-acc-pub', is_published: true, access_level: 'public', image_id: publicPic }));
  await createGuide(request({ ...meta, slug: 'qa-test-acc-mem', is_published: true, access_level: 'members', image_id: membersPic }));
  await createGuide(request({ ...meta, slug: 'qa-test-acc-shared-a', is_published: true, access_level: 'public', image_id: sharedPic }));
  await createGuide(request({ ...meta, slug: 'qa-test-acc-shared-b', is_published: true, access_level: 'members', image_id: sharedPic }));

  const pubAnon = await fetchAs(publicPic, 'anon');
  assert.equal(pubAnon.status, 200);
  assert.match(pubAnon.headers.get('cache-control'), /^public/);
  for (const id of [membersPic, sharedPic]) {
    for (const query of ['', '?fallback=none']) {
      const anon = await fetchAs(id, 'anon', query);
      assert.equal(anon.status, 404, 'anonymous gets no image');
      if (query) assert.equal(anon.headers.get('content-type'), null, 'strict mode has no image body');
    }
    const member = await fetchAs(id, 'member');
    assert.equal(member.status, 200);
    assert.doesNotMatch(member.headers.get('cache-control'), /public/);
    assert.match(member.headers.get('cache-control'), /no-store/);
    const admin = await fetchAs(id, 'admin');
    assert.equal(admin.status, 200);
    assert.match(admin.headers.get('cache-control'), /no-store/);
  }
  // Not referenced by any guide yet (e.g. just uploaded): admin only.
  assert.equal((await fetchAs(loosePic, 'anon')).status, 404);
  assert.equal((await fetchAs(loosePic, 'member')).status, 404);
  assert.equal((await fetchAs(loosePic, 'admin')).status, 200);
  // Making the guide public later makes the picture public again.
  await PUT(request({ ...meta, slug: 'qa-test-acc-mem', is_published: true, access_level: 'public', image_id: membersPic }), params('qa-test-acc-mem'));
  assert.equal((await fetchAs(membersPic, 'anon')).status, 200);
});

test('guideBodyImageAccess: strictest reference wins; layout, legacy body and tabs count; unreferenced is admin-only', () => {
  const F = '33333333-3333-4333-8333-333333333333.png';
  const pubLayout = { is_published: true, access_level: 'public', layout: { areas: { main: [{ type: 'image', src: `/api/guide-images/${F}` }] } } };
  const memBody = { is_published: true, access_level: 'members', body: `![a](/api/guide-images/${F})` };
  assert.equal(guideBodyImageAccess([pubLayout], F), 'public');
  assert.equal(guideBodyImageAccess([memBody], F), 'members');
  assert.equal(guideBodyImageAccess([pubLayout, memBody], F), 'members');
  assert.equal(guideBodyImageAccess([{ ...memBody, body: '', f2p_content: `x ${F}` }], F), 'members');
  assert.equal(guideBodyImageAccess([{ ...pubLayout, is_published: false }], F), 'admin');
  assert.equal(guideBodyImageAccess([pubLayout], '44444444-4444-4444-8444-444444444444.png'), 'admin');
  assert.equal(guideBodyImageAccess([{ ...pubLayout, draft: { access_level: 'members', layout: pubLayout.layout } }], F), 'members');
});

test('guide body images: members-only guides need a member or admin; public unchanged; shared and unreferenced are restricted', async () => {
  const as = (who) => ({ url: 'http://localhost/api/guide-images/x', headers: new Headers(), cookies: { get: (k) => (who === 'admin' && k === 'tff_admin_session' ? { value: token } : who === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) } });
  const upload = async () => {
    const form = new FormData(); form.set('guide', 'qa-test-body'); form.set('file', new File([PNG], 'b.png', { type: 'image/png' }));
    const res = await bodyUpload.POST(request(form));
    assert.equal(res.status, 201);
    return (await res.json()).src;
  };
  const get = (src, who) => bodyImageRoute.GET(as(who), { params: Promise.resolve({ file: src.split('/').pop() }) });
  const layoutWith = (src) => ({ version: 1, template: 'sidebar-right', areas: { main: [{ id: 'i1', type: 'image', src, alt: 'pixel' }], sidebar: [] } });
  const pubSrc = await upload(); const memSrc = await upload(); const sharedSrc = await upload(); const looseSrc = await upload();
  const mk = async (slug, access, src) => {
    await createGuide(request({ ...meta, slug, is_published: false, access_level: access }));
    assert.equal((await PUT(request({ ...meta, slug, is_published: true, access_level: access, layout: layoutWith(src) }), params(slug))).status, 200);
  };
  await mk('qa-test-body-pub', 'public', pubSrc);
  await mk('qa-test-body-mem', 'members', memSrc);
  await mk('qa-test-body-sh-a', 'public', sharedSrc);
  await mk('qa-test-body-sh-b', 'members', sharedSrc);

  const pub = await get(pubSrc, 'anon');
  assert.equal(pub.status, 200);
  assert.match(pub.headers.get('cache-control'), /^public, max-age=3600/);
  assert.doesNotMatch(pub.headers.get('cache-control'), /immutable/);
  for (const src of [memSrc, sharedSrc]) {
    const anon = await get(src, 'anon');
    assert.equal(anon.status, 404);
    assert.equal(await anon.text(), 'Not found');
    assert.match(anon.headers.get('cache-control'), /no-store/);
    for (const who of ['member', 'admin']) {
      const ok = await get(src, who);
      assert.equal(ok.status, 200);
      assert.match(ok.headers.get('cache-control'), /private, no-store/);
      assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
    }
  }
  assert.equal((await get(looseSrc, 'anon')).status, 404);
  assert.equal((await get(looseSrc, 'member')).status, 404);
  assert.equal((await get(looseSrc, 'admin')).status, 200);
});
