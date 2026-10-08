import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { decryptSecret, deriveTokenKey, encryptSecret } from '../lib/driveCrypto.mjs';
import { createDriveClient, DriveError, exchangeCode } from '../lib/driveClient.mjs';
import { createFakeDrive } from '../lib/driveFake.mjs';
import { createMongoTokenStore } from '../lib/driveTokenStore.mjs';
import { validateGalleryUpload, storeGalleryImageInDrive } from '../lib/galleryUpload.mjs';
import { clearGalleryImageCache, deliverGalleryImage } from '../lib/galleryImageDelivery.mjs';
import { countLegacyImages, migrateBatch } from '../lib/galleryMigration.mjs';
import { shapeGalleryRow } from '../lib/galleryRows.mjs';
import { readImageDimensions } from '../lib/imageDimensions.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 0, 7, 0, 0, 0, 5]), Buffer.alloc(20)]);
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Minimal in-memory stand-in for the Mongo collection operations used.
function memColl(rows) {
  const match = (row, f) => Object.entries(f).every(([k, v]) => {
    if (v instanceof RegExp) return typeof row[k] === 'string' && v.test(row[k]);
    if (v && typeof v === 'object' && '$in' in v) return v.$in.some((x) => (x === null ? row[k] == null : row[k] === x));
    if (v && typeof v === 'object' && '$nin' in v) return !v.$nin.includes(row[k]);
    return row[k] === v;
  });
  return {
    rows,
    findOne: async (f) => rows.find((r) => match(r, f)) || null,
    find: (f) => { let n = 1e9; const cur = { sort: () => cur, limit: (x) => { n = x; return cur; }, toArray: async () => rows.filter((r) => match(r, f)).slice(0, n) }; return cur; },
    countDocuments: async (f) => rows.filter((r) => match(r, f)).length,
    updateOne: async (f, u) => { const r = rows.find((x) => match(x, f)); if (!r) return; Object.assign(r, u.$set || {}); for (const k of Object.keys(u.$unset || {})) delete r[k]; },
  };
}

async function tmpFake() { return createFakeDrive(await fs.mkdtemp(path.join(os.tmpdir(), 'k710-fake-'))); }

test('token encryption round trip and tamper detection', () => {
  const key = deriveTokenKey({ MEMBER_SESSION_SECRET: 'a'.repeat(32), NODE_ENV: 'production' });
  const enc = encryptSecret('1//refresh-token', key);
  assert.ok(!enc.includes('refresh-token'));
  assert.equal(decryptSecret(enc, key), '1//refresh-token');
  assert.notEqual(encryptSecret('x', key), encryptSecret('x', key));
  assert.throws(() => decryptSecret(enc.slice(0, -2) + 'AA', key));
  const other = deriveTokenKey({ GALLERY_TOKEN_KEY: 'dedicated', NODE_ENV: 'production' });
  assert.throws(() => decryptSecret(enc, other));
  assert.throws(() => deriveTokenKey({ NODE_ENV: 'production' }));
});

test('token store encrypts at rest', async () => {
  let doc = null;
  const coll = {
    findOne: async () => doc,
    updateOne: async (_f, u) => { doc = { ...(doc || {}), ...u.$set }; },
    deleteOne: async () => { doc = null; },
  };
  const store = createMongoTokenStore(coll, { key: deriveTokenKey({ GALLERY_TOKEN_KEY: 'k', NODE_ENV: 'production' }) });
  await store.save({ refreshToken: 'rt-123', email: 'a@b.c' });
  assert.ok(!JSON.stringify(doc).includes('rt-123'));
  assert.equal((await store.load()).refreshToken, 'rt-123');
  await store.clear();
  assert.equal(await store.load(), null);
});

function mockDrive(handler, creds = { refreshToken: 'rt' }) {
  const calls = [];
  const fetchMock = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init, calls); };
  const client = createDriveClient({ fetch: fetchMock, store: { load: async () => creds, patch: async () => {} }, clientId: 'cid', clientSecret: 'sec' });
  return { client, calls };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('access token is refreshed once, cached, and refreshed again after a 401', async () => {
  let tokens = 0;
  const { client, calls } = mockDrive((url, init) => {
    if (url.includes('oauth2.googleapis.com/token')) { tokens += 1; return json({ access_token: `at${tokens}`, expires_in: 3600 }); }
    if (init.headers.Authorization === 'Bearer at1' && calls.filter((c) => c.url.includes('/files/')).length === 3) return new Response('', { status: 401 });
    return json({ id: 'f1', size: '10' });
  });
  await client.getInfo('f1');
  await client.getInfo('f1');
  assert.equal(tokens, 1);
  await client.getInfo('f1'); // first attempt 401 -> refresh -> retry
  assert.equal(tokens, 2);
});

test('invalid_grant surfaces a reauth error', async () => {
  const { client } = mockDrive((url) => (url.includes('/token') ? json({ error: 'invalid_grant' }, 400) : json({})));
  await assert.rejects(client.getInfo('f'), (e) => e instanceof DriveError && e.code === 'reauth');
});

test('not connected is reported without calling Google', async () => {
  const { client, calls } = mockDrive(() => json({}), null);
  assert.deepEqual(await client.getStatus(), { connected: false });
  await assert.rejects(client.getInfo('f'), (e) => e.code === 'not_connected');
  assert.equal(calls.length, 0);
});

test('multipart upload targets the folder and sends the bytes', async () => {
  const { client, calls } = mockDrive((url) => {
    if (url.includes('/token')) return json({ access_token: 'at', expires_in: 3600 });
    if (url.includes('/files?q') || url.includes('spaces=drive')) return json({ files: [{ id: 'folder1' }] });
    return json({ id: 'file1', size: String(PNG.length), md5Checksum: 'abc' });
  });
  const up = await client.uploadFile({ name: 'x.png', mimeType: 'image/png', bytes: PNG });
  assert.equal(up.id, 'file1');
  const post = calls.find((c) => c.url.includes('uploadType=multipart'));
  assert.ok(post.init.body.includes(PNG.subarray(0, 8)));
  assert.ok(post.init.body.toString('latin1').includes('"parents":["folder1"]'));
});

test('exchangeCode requires a refresh token', async () => {
  const f = async (url) => (String(url).includes('/token') ? json({ access_token: 'a' }) : json({}));
  await assert.rejects(exchangeCode({ fetch: f, clientId: 'c', clientSecret: 's', redirectUri: 'r', code: 'x' }), /offline access/);
  const g = async (url) => (String(url).includes('/token') ? json({ access_token: 'a', refresh_token: 'r' }) : json({ user: { emailAddress: 'k@x.com' } }));
  assert.deepEqual(await exchangeCode({ fetch: g, clientId: 'c', clientSecret: 's', redirectUri: 'r', code: 'x' }), { refreshToken: 'r', accessToken: 'a', email: 'k@x.com' });
});

test('upload validation: type, magic bytes, size, fields', () => {
  const base = { title: '', caption: '', altText: 'alt', position: 0 };
  const file = (type, size = PNG.length) => ({ type, size });
  assert.equal(validateGalleryUpload({ ...base, file: file('image/png'), buffer: PNG }).ok, true);
  assert.equal(validateGalleryUpload({ ...base, file: file('image/svg+xml'), buffer: PNG }).status, 415);
  assert.equal(validateGalleryUpload({ ...base, file: file('image/jpeg'), buffer: PNG }).status, 415);
  assert.equal(validateGalleryUpload({ ...base, file: file('image/png', 5 * 1024 * 1024), buffer: PNG }).status, 413);
  assert.equal(validateGalleryUpload({ ...base, altText: '', file: file('image/png'), buffer: PNG }).status, 400);
  assert.equal(validateGalleryUpload({ ...base, position: 1.5, file: file('image/png'), buffer: PNG }).status, 400);
  assert.deepEqual(readImageDimensions(PNG), { width: 7, height: 5 });
});

test('stored gallery doc has metadata only, no image bytes', async () => {
  const drive = await tmpFake();
  const doc = await storeGalleryImageInDrive({ drive, buffer: PNG, mimeType: 'image/png', title: 't', caption: '', altText: 'a', position: 1, isPublished: true });
  assert.equal(doc.storage, 'drive');
  assert.ok(doc.drive_file_id.startsWith('fake-'));
  assert.equal(doc.image_url, undefined);
  assert.equal(doc.width, 7);
});

async function deliver(coll, drive, id, extra = {}) {
  return deliverGalleryImage({ id, coll, getDrive: async () => drive, isAdmin: async () => false, ifNoneMatch: null, ...extra });
}

test('proxy: published streams with cache headers, unpublished is hidden but previewable by admin', async () => {
  clearGalleryImageCache();
  const drive = await tmpFake();
  const pub = await storeGalleryImageInDrive({ drive, buffer: PNG, mimeType: 'image/png', title: '', caption: '', altText: 'a', position: 0, isPublished: true });
  const hid = await storeGalleryImageInDrive({ drive, buffer: PNG, mimeType: 'image/png', title: '', caption: '', altText: 'a', position: 0, isPublished: false });
  const coll = memColl([pub, hid]);

  const ok = await deliver(coll, drive, pub.id);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.match(ok.headers.get('cache-control'), /public, max-age=86400, stale-while-revalidate/);
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
  assert.ok(!JSON.stringify([...ok.headers]).includes(pub.drive_file_id));

  const etag = ok.headers.get('etag');
  assert.equal((await deliver(coll, drive, pub.id, { ifNoneMatch: etag })).status, 304);

  assert.equal((await deliver(coll, drive, hid.id)).status, 404);
  const preview = await deliver(coll, drive, hid.id, { isAdmin: async () => true });
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('cache-control'), /private/);
});

test('proxy: missing Drive file -> 404 placeholder, Drive outage -> 502 placeholder, bad id -> 404', async () => {
  clearGalleryImageCache();
  const drive = await tmpFake();
  const doc = await storeGalleryImageInDrive({ drive, buffer: PNG, mimeType: 'image/png', title: '', caption: '', altText: 'a', position: 0, isPublished: true });
  const coll = memColl([doc]);
  await drive.trashFile(doc.drive_file_id);
  const gone = await deliver(coll, drive, doc.id);
  assert.equal(gone.status, 404);
  assert.equal(gone.headers.get('content-type'), 'image/svg+xml');
  const broken = { downloadFile: async () => { throw new DriveError('upstream', 'x', 502); } };
  const outage = await deliver(coll, broken, doc.id);
  assert.equal(outage.status, 502);
  assert.equal(outage.headers.get('content-type'), 'image/svg+xml');
  assert.equal((await deliver(coll, drive, 'nope')).status, 404);
  assert.equal((await deliver(coll, drive, UUID(99))).status, 404);
});

test('proxy: legacy base64 and https rows still work', async () => {
  const legacy = { id: UUID(1), is_published: true, image_url: `data:image/png;base64,${PNG.toString('base64')}` };
  const remote = { id: UUID(2), is_published: true, image_url: 'https://example.com/a.png' };
  const coll = memColl([legacy, remote]);
  const res = await deliver(coll, null, legacy.id);
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
  const redirect = await deliver(coll, null, remote.id);
  assert.equal(redirect.status, 302);
});

test('list shaping never exposes base64 or Drive ids', () => {
  const dbRow = shapeGalleryRow({ id: 'a', image_url: '', has_drive_file: false });
  assert.equal(dbRow.image_url, '/api/gallery/image/a');
  assert.equal(dbRow.storage, 'db');
  const driveRow = shapeGalleryRow({ id: 'b', image_url: '', has_drive_file: true });
  assert.equal(driveRow.storage, 'drive');
  assert.equal(driveRow.drive_file_id, undefined);
  assert.equal(shapeGalleryRow({ id: 'c', image_url: 'https://x/y.png', has_drive_file: false }).image_url, 'https://x/y.png');
});

test('migration moves legacy rows in batches, is idempotent, and leaves failures untouched', async () => {
  const drive = await tmpFake();
  const good = (n) => ({ id: UUID(n), created_at: n, image_url: `data:image/png;base64,${PNG.toString('base64')}` });
  const rows = [good(1), good(2), good(3), { id: UUID(4), created_at: 4, image_url: 'data:image/png;base64,AAAA' }, { id: UUID(5), image_url: 'https://x/y.png' }];
  const coll = memColl(rows);
  assert.equal(await countLegacyImages(coll), 4);
  const first = await migrateBatch({ coll, drive, batchSize: 2 });
  assert.equal(first.migrated.length, 2);
  assert.equal(first.remaining, 2);
  assert.equal(rows[0].storage, 'drive');
  assert.equal(rows[0].image_url, undefined);
  const second = await migrateBatch({ coll, drive, batchSize: 5 });
  assert.equal(second.migrated.length, 1);
  assert.equal(second.failed.length, 1);
  assert.equal(second.remaining, 0);
  assert.ok(rows[3].image_url.startsWith('data:'));
  const third = await migrateBatch({ coll, drive, batchSize: 5, skipIds: [UUID(4)] });
  assert.deepEqual(third, { migrated: [], failed: [], remaining: 0 });
  // migrated rows now serve from Drive through the proxy
  clearGalleryImageCache();
  rows.forEach((r) => { r.is_published = true; });
  const res = await deliver(coll, drive, UUID(1));
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
});
