import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFakeDrive } from '../lib/driveFake.mjs';
import { createDriveClient, DriveError } from '../lib/driveClient.mjs';
import {
  applicantFolderName, createFolderTree, FolderNameError, ROOT_FOLDER_NAME, SITE_FOLDERS, validateSubfolder,
} from '../lib/driveFolders.mjs';
import {
  createSiteImages, deliverSiteImage, PICK_ACCESS_MESSAGE, publicSiteImage, siteImageUrl, SiteImageError,
} from '../lib/siteImages.mjs';
import { buildPickerConfig, PICKER_NOT_SET_UP, readPickerEnv } from '../lib/pickerConfig.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.from([0, 0, 0, 7, 0, 0, 0, 5]), Buffer.alloc(20)]);
const tmpDrive = async () => createFakeDrive(await fs.mkdtemp(path.join(os.tmpdir(), 'k710-site-')));
function memColl() {
  const rows = [];
  return {
    rows,
    insertOne: async (d) => { rows.push(d); },
    findOne: async (f) => rows.find((r) => Object.entries(f).every(([k, v]) => r[k] === v)) || null,
    updateOne: async (f, u, o) => { let r = rows.find((x) => x._id === f._id); if (!r && o?.upsert) { r = { _id: f._id }; rows.push(r); } Object.assign(r || {}, u.$set); },
    deleteOne: async (f) => { const i = rows.findIndex((r) => r._id === f._id); if (i >= 0) rows.splice(i, 1); },
    deleteMany: async () => { rows.length = 0; },
  };
}
const setup = async (extra = {}) => {
  const drive = await tmpDrive();
  const cache = memColl();
  const tree = createFolderTree({ drive, cacheColl: cache, memory: new Map(), pending: new Map() });
  const coll = memColl();
  return { drive, tree, cache, coll, images: createSiteImages({ drive, tree, coll, ...extra }) };
};
const listDir = async (dir) => (await fs.readdir(dir).catch(() => [])).sort();

test('folder tree has the exact names and is created once, then cached', async () => {
  const { drive, tree } = await setup();
  let creates = 0;
  const real = drive.findOrCreateFolder.bind(drive);
  drive.findOrCreateFolder = async (...a) => { creates += 1; return real(...a); };
  const ids = await Promise.all([tree.folderId('gallery'), tree.folderId('gallery'), tree.folderId('hero')]);
  assert.equal(ids[0], ids[1]);
  assert.equal(creates, 3, 'root + gallery + hero, concurrent calls deduped');
  await tree.folderId('gallery'); await tree.folderId('hero');
  assert.equal(creates, 3, 'cached');
  await tree.folderId('guide'); await tree.folderId('tool'); await tree.folderId('application', '1');
  assert.deepEqual(await listDir(path.join(drive.root, 'tree', ROOT_FOLDER_NAME)), ['Applications', 'Gallery images', 'Guides images', 'Hero images', 'Tools and calculators images']);
  assert.equal(ROOT_FOLDER_NAME, 'K710 Website');
  assert.deepEqual(Object.values(SITE_FOLDERS), ['Gallery images', 'Guides images', 'Hero images', 'Tools and calculators images', 'Help images', 'Rally sheets', 'Applications']);
});

test('a cold instance reuses ids from the Mongo cache instead of creating folders again', async () => {
  const { drive, cache } = await setup();
  const a = createFolderTree({ drive, cacheColl: cache, memory: new Map(), pending: new Map() });
  const id = await a.folderId('application', '12345');
  let creates = 0;
  const real = drive.findOrCreateFolder.bind(drive);
  drive.findOrCreateFolder = async (...x) => { creates += 1; return real(...x); };
  const b = createFolderTree({ drive, cacheColl: cache, memory: new Map(), pending: new Map() });
  assert.equal(await b.folderId('application', '12345'), id);
  assert.equal(creates, 0);
});

test('a folder trashed by hand is recreated when the cached id is stale', async () => {
  let clock = 1_000_000;
  const { drive, tree, images } = await setup({});
  void images;
  const timed = createFolderTree({ drive, memory: new Map(), pending: new Map(), now: () => clock });
  const imgs = createSiteImages({ drive, tree: timed, coll: memColl() });
  const first = await imgs.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' }, name: 'a.png' });
  await drive.trashFile(first.drive_folder_id);
  clock += 11 * 60 * 1000;
  const second = await imgs.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' }, name: 'b.png' });
  assert.notEqual(second.drive_folder_id, first.drive_folder_id);
  assert.ok(await tree.folderId('hero'));
});

test('applicant folder names: digits only, path tricks rejected', async () => {
  assert.equal(validateSubfolder('application', '9876543210'), '9876543210');
  for (const bad of ['', null, '../x', '12/34', '12 34', '1234a', 'a'.repeat(5), '1'.repeat(21), '..', '%2e%2e', '12\n34', '١٢٣']) {
    assert.throws(() => validateSubfolder('application', bad), FolderNameError, String(bad));
  }
  for (const bad of ['../x', 'a/b', '.hidden', 'x\\y', '', ' ']) {
    if (bad === '') { assert.equal(validateSubfolder('hero', bad), ''); continue; }
    assert.throws(() => validateSubfolder('hero', bad), FolderNameError, bad);
  }
  assert.equal(validateSubfolder('hero', 'Home page'), 'Home page');
  assert.equal(applicantFolderName(' 123 456 '), '123456');
  assert.equal(applicantFolderName('../../etc'), 'unknown-player-id');
  assert.equal(applicantFolderName(''), 'unknown-player-id');
  const { tree } = await setup();
  await assert.rejects(() => tree.folderId('application', '../x'), FolderNameError);
  await assert.rejects(() => tree.folderId('nope'), FolderNameError);
});

test('store: metadata only, bytes land in the right Drive folder', async () => {
  const { drive, images, coll } = await setup({ uuid: () => '11111111-1111-4111-8111-111111111111' });
  const doc = await images.store({ folder: 'tool', file: { bytes: PNG, type: 'image/png' }, name: 'calc.png', alt: 'A calculator', createdBy: 'admin' });
  assert.equal(doc._id, '11111111-1111-4111-8111-111111111111');
  assert.equal(doc.folder, 'tool');
  assert.equal(doc.mime, 'image/png');
  assert.equal(doc.size, PNG.length);
  assert.equal(doc.width, 7); assert.equal(doc.height, 5);
  assert.equal(doc.alt, 'A calculator');
  assert.ok(doc.md5);
  assert.ok(!JSON.stringify(coll.rows).includes('base64'));
  assert.deepEqual(await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Tools and calculators images')), ['calc.png']);
  const pub = publicSiteImage(doc);
  assert.equal(pub.url, siteImageUrl(doc._id));
  assert.ok(!JSON.stringify(pub).includes(doc.drive_file_id));
});

test('store rejects disguised, oversized, wrong-type files and unknown folders', async () => {
  const { images } = await setup();
  await assert.rejects(() => images.store({ folder: 'hero', file: { bytes: Buffer.from('not an image at all'), type: 'image/png' } }), { status: 415 });
  await assert.rejects(() => images.store({ folder: 'hero', file: { bytes: PNG, type: 'application/pdf' } }), { status: 415 });
  await assert.rejects(() => images.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' }, maxBytes: 10 }), { status: 413 });
  await assert.rejects(() => images.store({ folder: 'bogus', file: { bytes: PNG, type: 'image/png' } }), SiteImageError);
});

test('Drive not connected maps to a plain, actionable error', async () => {
  const { images, drive } = await setup();
  drive.uploadFile = async () => { throw new DriveError('not_connected', 'x', 409); };
  await assert.rejects(() => images.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' } }), (e) => e.status === 409 && e.needsConnect === true);
  drive.uploadFile = async () => { throw new Error('socket'); };
  await assert.rejects(() => images.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' } }), { status: 502 });
});

test('copyPicked copies into the destination folder and the copy survives deleting the original', async () => {
  const { drive, images } = await setup();
  const other = await drive.findOrCreateFolder('Someone elses folder');
  const original = await drive.uploadFile({ name: 'pic.png', mimeType: 'image/png', bytes: PNG, folderId: other });
  const doc = await images.copyPicked({ folder: 'hero', fileId: original.id, alt: 'Hero' });
  assert.notEqual(doc.drive_file_id, original.id);
  assert.equal(doc.storage, 'drive');
  assert.equal(doc.size, PNG.length);
  await drive.trashFile(original.id);
  const file = await drive.downloadFile(doc.drive_file_id);
  assert.deepEqual(Buffer.from(await new Response(file.body).arrayBuffer()), PNG);
  assert.deepEqual(await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Hero images')), ['pic.png']);
});

test('copyPicked errors: missing access, non-images, trashed, copy impossible falls back to a reference', async () => {
  const { drive, images } = await setup();
  await assert.rejects(() => images.copyPicked({ folder: 'hero', fileId: 'does-not-exist' }), (e) => e.status === 403 && e.message === PICK_ACCESS_MESSAGE);
  await assert.rejects(() => images.copyPicked({ folder: 'hero', fileId: '../etc' }), SiteImageError);
  const pdf = await drive.uploadFile({ name: 'x.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4 xxxxxxxx') });
  await assert.rejects(() => images.copyPicked({ folder: 'hero', fileId: pdf.id }), { status: 415 });
  const fake = await drive.uploadFile({ name: 'liar.png', mimeType: 'image/png', bytes: Buffer.from('definitely not a png file') });
  await assert.rejects(() => images.copyPicked({ folder: 'hero', fileId: fake.id }), { status: 415 });
  const good = await drive.uploadFile({ name: 'ok.png', mimeType: 'image/png', bytes: PNG });
  const realCopy = drive.copyFile.bind(drive);
  drive.copyFile = async () => { throw new DriveError('upstream', 'x'); };
  const ref = await images.copyPicked({ folder: 'tool', fileId: good.id });
  assert.equal(ref.storage, 'reference');
  assert.equal(ref.drive_file_id, good.id);
  await images.remove(ref._id);
  assert.equal((await drive.getInfo(good.id)).trashed, false, 'a referenced file is never trashed');
  drive.copyFile = async () => { throw new DriveError('reauth', 'x', 403); };
  await assert.rejects(() => images.copyPicked({ folder: 'tool', fileId: good.id }), { status: 403 });
  drive.copyFile = realCopy;
  await drive.trashFile(good.id);
  await assert.rejects(() => images.copyPicked({ folder: 'tool', fileId: good.id }), { status: 404 });
});

test('remove moves the Drive file to the trash and drops the record', async () => {
  const { drive, images, coll } = await setup();
  const doc = await images.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' }, name: 'a.png' });
  assert.equal(await images.remove(doc._id, { folders: ['tool'] }), false, 'folder guard');
  assert.equal(await images.remove(doc._id), true);
  assert.equal((await drive.getInfo(doc.drive_file_id)).trashed, true);
  assert.equal(coll.rows.length, 0);
});

test('delivery: public folders cache, 304s on ETag, gallery/application are admin-only, Drive failure gives a placeholder', async () => {
  const { drive, images, coll } = await setup();
  const hero = await images.store({ folder: 'hero', file: { bytes: PNG, type: 'image/png' }, name: 'h.png' });
  const gal = await images.store({ folder: 'gallery', file: { bytes: PNG, type: 'image/png' }, name: 'g.png' });
  const app = await images.store({ folder: 'application', subfolder: '1234', file: { bytes: PNG, type: 'image/png' }, name: 'a.png' });
  const call = (id, admin = false, inm = null, getDrive = async () => drive) => deliverSiteImage({ id, coll, getDrive, isAdmin: async () => admin, ifNoneMatch: inm });
  const ok = await call(hero._id);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control'), /public, max-age=86400/);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
  assert.equal((await call(hero._id, false, ok.headers.get('etag'))).status, 304);
  assert.equal((await call(gal._id)).status, 404);
  assert.equal((await call(app._id)).status, 404);
  assert.equal((await call(gal._id, true)).status, 200);
  assert.match((await call(gal._id, true)).headers.get('cache-control'), /private/);
  assert.equal((await call('not-a-uuid')).status, 404);
  assert.equal((await call('00000000-0000-4000-8000-000000000000')).status, 404);
  const down = await call(hero._id, false, null, async () => { throw new Error('offline'); });
  assert.equal(down.status, 502);
  assert.equal(down.headers.get('content-type'), 'image/svg+xml');
  await drive.trashFile(hero.drive_file_id);
  assert.equal((await call(hero._id)).status, 404);
});

test('fake Drive mirrors the folder tree on disk and lists only live images', async () => {
  const drive = await tmpDrive();
  const f = await drive.findOrCreateFolder('A'); const g = await drive.findOrCreateFolder('B', f);
  assert.equal(await drive.findOrCreateFolder('B', f), g);
  const up = await drive.uploadFile({ name: 'x.png', mimeType: 'image/png', bytes: PNG, folderId: g });
  assert.deepEqual(await listDir(path.join(drive.root, 'tree', 'A', 'B')), ['x.png']);
  assert.deepEqual((await drive.listImages()).map((i) => [i.name, i.folderPath]), [['x.png', 'A / B']]);
  await drive.trashFile(up.id);
  assert.deepEqual(await drive.listImages(), []);
});

test('real client: findOrCreateFolder searches under the parent, copyFile targets the folder, only the access token is exposed', async () => {
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'short-lived', expires_in: 3600 }), { status: 200 });
    if (init.method === 'POST' && String(url).endsWith('/files?fields=id')) return new Response(JSON.stringify({ id: 'newfolder' }), { status: 200 });
    if (String(url).includes('/files?')) return new Response(JSON.stringify({ files: [] }), { status: 200 });
    return new Response(JSON.stringify({ id: 'copied' }), { status: 200 });
  };
  const client = createDriveClient({ fetch: fetchMock, store: { load: async () => ({ refreshToken: 'REFRESH-SECRET' }), patch: async () => {} }, clientId: 'c', clientSecret: 's' });
  assert.equal(await client.findOrCreateFolder('Hero images', 'parent1'), 'newfolder');
  const search = decodeURIComponent(calls.find((c) => c.url.includes('/files?q=')).url).replace(/\+/g, ' ');
  assert.match(search, /name='Hero images'/);
  assert.match(search, /'parent1' in parents/);
  const create = JSON.parse(calls.find((c) => c.init.method === 'POST' && c.url.endsWith('fields=id')).init.body);
  assert.deepEqual(create.parents, ['parent1']);
  await client.copyFile('picked', { name: 'n.png', folderId: 'dest' });
  const copy = calls.find((c) => c.url.includes('/files/picked/copy'));
  assert.deepEqual(JSON.parse(copy.init.body), { name: 'n.png', parents: ['dest'] });
  assert.equal(await client.getAccessToken(), 'short-lived');
});

test('picker config: needs connection, explains missing setup, and never carries the refresh token', async () => {
  const connected = { fake: false, getStatus: async () => ({ connected: true }), getAccessToken: async () => 'short-lived-token' };
  const none = await buildPickerConfig({ drive: { ...connected, getStatus: async () => ({ connected: false }) }, env: {} });
  assert.equal(none.status, 409);
  const notSetUp = await buildPickerConfig({ drive: connected, env: {} });
  assert.equal(notSetUp.body.configured, false);
  assert.equal(notSetUp.body.message, PICKER_NOT_SET_UP);
  assert.deepEqual(notSetUp.body.missing, ['GOOGLE_PICKER_API_KEY', 'GOOGLE_PICKER_APP_ID']);
  assert.ok(notSetUp.body.steps.length >= 3);
  assert.ok(!('accessToken' in notSetUp.body));
  const env = { GOOGLE_PICKER_API_KEY: 'key', GOOGLE_PICKER_APP_ID: '123456789', GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret', REFRESH_TOKEN: 'rt' };
  const ready = await buildPickerConfig({ drive: connected, env });
  assert.deepEqual(Object.keys(ready.body).sort(), ['accessToken', 'appId', 'configured', 'connected', 'developerKey']);
  assert.ok(!JSON.stringify(ready.body).match(/client-secret|refresh|rt"/i));
  assert.equal(readPickerEnv(env).configured, true);
  const fake = await buildPickerConfig({ drive: { fake: true, getStatus: async () => ({ connected: true }) }, env: {} });
  assert.deepEqual(fake.body, { configured: true, fake: true, connected: true });
});
