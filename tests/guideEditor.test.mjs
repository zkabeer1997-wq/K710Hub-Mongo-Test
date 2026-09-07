import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { guideCategories } from '../lib/guideValidation.mjs';

// Exercise actual handlers with a controlled database boundary.
const state = { tables: { kingdom_guides: [], guide_categories: [], guide_attachments: [] }, paths: [] };
globalThis.__guideTest = state;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('/lib/mongo')) return { url: 'test:guide-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:cache', shortCircuit: true };
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (/\/(adminAuth|mongoCollections)$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'test:guide-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return {
        format: 'module',
        shortCircuit: true,
        source: `import { createFakeMongo } from ${JSON.stringify(helperUrl)}; export const { getCollection, ensureIndexes } = createFakeMongo(globalThis.__guideTest.tables, { kingdom_guides: ['slug'] });`,
      };
    }
    if (url === 'test:cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = (...args) => globalThis.__guideTest.paths.push(args);' };
    return nextLoad(url, context);
  },
});
const { PUT } = await import('../app/api/admin-guides/[slug]/route.js');
const { POST: categoryPost } = await import('../app/api/admin-guide-categories/route.js');
const { POST: photoPost } = await import('../app/api/admin-guide-images/route.js');
process.env.ADMIN_PASSWORD = 'guide-editor-test-only';
const token = await mintAdminToken();
function request(body, authenticated = true) {
  return { cookies: { get: () => authenticated ? { value: token } : undefined }, json: async () => body, formData: async () => body };
}
const guide = { slug: 'renamed-guide', title: 'Updated title', description: 'Updated description', category: 'New Category', body: '## Guide\n\n![Formation](https://example.com/photo.png)', position: 10, is_published: true };
const params = { params: Promise.resolve({ slug: 'old-guide' }) };

test('all mutation endpoints reject an unauthenticated caller', async () => {
  const before = state.tables.kingdom_guides.length;
  for (const handler of [PUT, categoryPost, photoPost]) assert.equal((await handler(request({}, false), params)).status, 401);
  assert.equal(state.tables.kingdom_guides.length, before);
  assert.equal(state.tables.guide_attachments.length, 0);
});
test('saving renames the existing row and invalidates old and new public URLs', async () => {
  state.tables.kingdom_guides = [{ slug: 'old-guide', title: 'Old title', description: 'Old', category: 'Old Category', body: 'old body', position: 1, is_published: true, access_level: 'public' }];
  const response = await PUT(request(guide), params);
  assert.equal(response.status, 200);
  const saved = (await response.json()).guide;
  assert.equal(saved.slug, guide.slug);
  assert.equal(saved.description, guide.description);
  assert.equal(saved.body, guide.body);
  assert.equal(state.tables.kingdom_guides.find((g) => g.slug === 'old-guide'), undefined);
  assert.equal(state.tables.kingdom_guides.find((g) => g.slug === 'renamed-guide').description, guide.description);
  for (const path of ['/guides', '/guides/old-guide', '/guides/renamed-guide']) assert.ok(state.paths.some((p) => p[0] === path));
});
test('slug collisions and removed guides return actionable errors', async () => {
  state.tables.kingdom_guides = [
    { slug: 'old-guide', title: 'Old title', description: 'Old', category: 'Old Category', body: 'old body', position: 1, is_published: true, access_level: 'public' },
    { slug: 'renamed-guide', title: 'Taken', description: 'Taken', category: 'Taken', body: 'taken body', position: 2, is_published: true, access_level: 'public' },
  ];
  assert.equal((await PUT(request(guide), params)).status, 409);
  state.tables.kingdom_guides = state.tables.kingdom_guides.filter((g) => g.slug !== 'old-guide');
  assert.equal((await PUT(request(guide), params)).status, 404);
});
test('invalid slugs and oversized text never reach the database', async () => {
  state.tables.kingdom_guides = [{ slug: 'old-guide', title: 'Old title', description: 'Old', category: 'Old Category', body: 'old body', position: 1, is_published: true, access_level: 'public' }];
  const before = JSON.parse(JSON.stringify(state.tables.kingdom_guides));
  for (const payload of [{ ...guide, slug: '../admin' }, { ...guide, body: 'x'.repeat(120001) }, { ...guide, title: '' }]) {
    assert.equal((await PUT(request(payload), params)).status, 400);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(state.tables.kingdom_guides)), before);
});
test('standalone categories save and trigger a public directory refresh', async () => {
  assert.equal((await categoryPost(request({ name: ' Pets ' }))).status, 201);
  assert.equal(state.tables.guide_categories.at(-1).name, 'Pets');
  assert.equal((await categoryPost(request({ name: 'Pets' }))).status, 409);
  assert.deepEqual(guideCategories([{ category: 'Battle Guide' }], [{ name: 'Pets' }, { name: 'Battle Guide' }]), ['Battle Guide', 'Pets']);
});
test('image validation rejects oversized or disguised files before storage', async () => {
  for (const file of [new File(['not a PNG'], 'fake.png', { type: 'image/png' }), new File([new Uint8Array(3145729)], 'big.jpg', { type: 'image/jpeg' })]) {
    const form = new FormData(); form.set('file', file);
    assert.ok([413, 415].includes((await photoPost(request(form))).status));
  }
  assert.equal(state.tables.guide_attachments.length, 0);
});
test('valid photo uploads are stored and returned as a self-contained data URL', async () => {
  const form = new FormData();
  form.set('file', new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64')], 'photo.png', { type: 'image/png' }));
  const response = await photoPost(request(form));
  assert.equal(response.status, 201);
  const { url } = await response.json();
  assert.match(url, /^data:image\/png;base64,/);
  assert.equal(state.tables.guide_attachments.length, 1);
  assert.equal(state.tables.guide_attachments[0].data_url, url);
});
