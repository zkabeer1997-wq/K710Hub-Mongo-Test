import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';
import { mintAdminToken } from '../lib/adminAuth.js';

const state = { tables: { kingdom_guides: [], guide_attachments: [] }, paths: [] };
globalThis.__guideBuilderTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    { const r = driveHookResolve(specifier, context, nextResolve); if (r) return r; }
    if (/\/mongo(\.js)?$/.test(specifier)) return { url: 'test:builder-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:builder-cache', shortCircuit: true };
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (/\/(adminAuth|mongoCollections|memberAuth)$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    { const l = driveHookLoad(url); if (l) return l; }
    if (url === 'test:builder-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__guideBuilderTest.tables, { kingdom_guides: ['slug'] });` };
    }
    if (url === 'test:builder-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = (...args) => globalThis.__guideBuilderTest.paths.push(args);' };
    return nextLoad(url, context);
  },
});
const { PUT, GET } = await import('../app/api/admin-guides/[slug]/route.js');
const { PUT: draftPut, DELETE: draftDelete } = await import('../app/api/admin-guides/[slug]/draft/route.js');
const { POST: createGuide } = await import('../app/api/admin-guides/route.js');
const { POST: upload, GET: library } = await import('../app/api/admin-guide-images/route.js');
const { GET: serveImage } = await import('../app/api/guide-images/[file]/route.js');
const { PUT: publicPut } = await import('../app/api/guides/[slug]/route.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const fakeDrive = await tmpFakeDrive();
setDriveStorageFactory(() => fakeDrive);
process.env.ADMIN_PASSWORD = 'guide-builder-test-only';
process.env.GUIDE_IMAGE_ACCESS_TTL_MS = '0';
const token = await mintAdminToken();
const request = (body, authenticated = true, url = 'http://localhost/api/x') => ({ url, cookies: { get: () => (authenticated ? { value: token } : undefined) }, json: async () => body, formData: async () => body });
const params = slug => ({ params: Promise.resolve({ slug }) });
const layout = { version: 1, template: 'sidebar-right', areas: { main: [{ id: 'a1', type: 'heading', level: 2, text: 'Hello' }, { id: 'a2', type: 'text', md: 'Body **text**' }], sidebar: [{ id: 'a3', type: 'callout', tone: 'tip', title: 'Tip', md: 'Short' }] } };
const meta = { slug: 'builder-guide', title: 'Builder guide', category: 'Cat', description: 'd', position: 1, access_level: 'public' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');

test('a guide is created empty, then saved with a layout that keeps the legacy body in sync', async () => {
  assert.equal((await createGuide(request({ ...meta, body: '', is_published: false }))).status, 201);
  const saved = await PUT(request({ ...meta, is_published: true, layout }), params('builder-guide'));
  assert.equal(saved.status, 200);
  const guide = (await saved.json()).guide;
  assert.equal(guide.layout.template, 'sidebar-right');
  assert.match(guide.body, /## Hello\n\nBody \*\*text\*\*\n\n> \*\*Tip\*\*/);
  assert.equal((await (await GET(request({}), params('builder-guide'))).json()).guide.layout.areas.main.length, 2);
});

test('unknown block types, bad templates and oversized layouts are rejected without touching the database', async () => {
  const before = JSON.stringify(state.tables.kingdom_guides);
  for (const bad of [
    { ...layout, areas: { ...layout.areas, main: [{ type: 'embed', html: '<script>1</script>' }] } },
    { ...layout, template: 'missing' },
    { ...layout, areas: { ...layout.areas, main: Array.from({ length: 301 }, () => ({ type: 'divider' })) } },
    { ...layout, areas: { ...layout.areas, main: [{ type: 'text', md: 'x'.repeat(30000) }, { type: 'text', md: 'x'.repeat(30000) }, { type: 'image', src: `data:image/png;base64,${'A'.repeat(139000)}`, alt: 'a'.repeat(300), caption: 'c'.repeat(300) }, ...Array.from({ length: 8 }, () => ({ type: 'image', src: `data:image/png;base64,${'A'.repeat(139000)}`, alt: 'x' }))] } },
  ]) {
    assert.equal((await PUT(request({ ...meta, is_published: false, layout: bad }), params('builder-guide'))).status, 400);
  }
  assert.equal(JSON.stringify(state.tables.kingdom_guides), before);
});

test('publishing needs alt text on every image, drafts do not', async () => {
  const withImage = { ...layout, areas: { ...layout.areas, main: [{ id: 'i1', type: 'image', src: 'https://example.com/a.png', alt: '' }] } };
  assert.equal((await PUT(request({ ...meta, is_published: true, layout: withImage }), params('builder-guide'))).status, 400);
  assert.equal((await PUT(request({ ...meta, is_published: false, layout: withImage }), params('builder-guide'))).status, 200);
});

test('autosaved drafts never change live fields and are cleared by a real save', async () => {
  await PUT(request({ ...meta, is_published: true, layout }), params('builder-guide'));
  const edited = { ...layout, areas: { ...layout.areas, main: [{ id: 'z', type: 'heading', level: 3, text: 'Draft only' }] } };
  assert.equal((await draftPut(request({ ...meta, title: 'Draft title', layout: edited }), params('builder-guide'))).status, 200);
  let row = state.tables.kingdom_guides.find(g => g.slug === 'builder-guide');
  assert.equal(row.title, 'Builder guide');
  assert.equal(row.layout.areas.main.length, 2);
  assert.equal(row.draft.title, 'Draft title');
  assert.equal(row.draft.layout.areas.main[0].text, 'Draft only');
  const loaded = (await (await GET(request({}), params('builder-guide'))).json()).guide;
  assert.equal(loaded.draft.title, 'Draft title');
  assert.equal((await draftPut(request({ layout: { ...edited, template: 'nope' } }), params('builder-guide'))).status, 400);
  assert.equal((await draftPut(request({ layout: edited }), params('missing-guide'))).status, 404);
  await PUT(request({ ...meta, is_published: true, layout: edited }), params('builder-guide'));
  row = state.tables.kingdom_guides.find(g => g.slug === 'builder-guide');
  assert.equal(row.draft, undefined);
  await draftPut(request({ layout }), params('builder-guide'));
  await draftDelete(request({}), params('builder-guide'));
  assert.equal(state.tables.kingdom_guides.find(g => g.slug === 'builder-guide').draft, undefined);
});

test('builder endpoints require an admin', async () => {
  for (const call of [() => GET(request({}, false), params('builder-guide')), () => draftPut(request({ layout }, false), params('builder-guide')), () => draftDelete(request({}, false), params('builder-guide')), () => library(request({}, false))]) {
    assert.equal((await call()).status, 401);
  }
});

test('uploads return a short /api/guide-images address, are listed per guide and served back', async () => {
  const form = new FormData();
  form.set('file', new File([png], 'photo.png', { type: 'image/png' }));
  form.set('guide', 'builder-guide');
  form.set('compact', '1');
  const response = await upload(request(form));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.src, /^\/api\/guide-images\/[0-9a-f-]{36}\.png$/);
  assert.equal(body.url, body.src);
  const listed = await (await library(request({}, true, 'http://localhost/api/admin-guide-images?guide=builder-guide'))).json();
  assert.deepEqual(listed.images.map(i => i.src), [body.src]);
  assert.equal((await (await library(request({}, true, 'http://localhost/api/admin-guide-images?guide=other'))).json()).images.length, 0);
  const served = await serveImage(request({}, true), { params: Promise.resolve({ file: body.src.split('/').pop() }) });
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
  const layoutWithUpload = { ...layout, areas: { ...layout.areas, main: [{ id: 'u1', type: 'image', src: body.src, alt: 'A pixel' }] } };
  assert.equal((await PUT(request({ ...meta, is_published: true, layout: layoutWithUpload }), params('builder-guide'))).status, 200);
});

test('the quick public title/body editor refuses to overwrite a block layout', async () => {
  const response = await publicPut(request({ title: 'x', body: 'y' }), params('builder-guide'));
  assert.equal(response.status, 409);
});
