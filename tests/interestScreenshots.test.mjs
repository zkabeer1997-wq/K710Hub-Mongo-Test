import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';

const state = { tables: {} };
globalThis.__interestShotsTest = state;
registerHooks({
  resolve(s, c, next) {
    { const r = driveHookResolve(s, c, next); if (r) return r; }
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:is-mongo', shortCircuit: true };
    if (s === 'next/server') return next(s + '.js', c);
    if (/\/(mongoCollections|rateLimit|interestUploadLimits|transferIntakePeriods\.server|adminAuth)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    { const l = driveHookLoad(u); if (l) return l; }
    if (u === 'test:is-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__interestShotsTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'interest-shots-test-only';
const interest = await import('../app/api/interest/route.js');
const shot = await import('../app/api/admin-interest-submissions/[id]/screenshot/[index]/route.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const { migrateInterestBatch } = await import('../lib/interestScreenshots.mjs');
const { createFolderTree } = await import('../lib/driveFolders.mjs');
state.tables[COLLECTIONS.TRANSFER_INTAKE_PERIODS] = [{ _id: 'p1', label: 'Test window', is_active: true }];

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let ip = 40;
function req(overrides = {}, count = 2, extra = []) {
  const fd = new FormData();
  const base = {
    in_game_name: 'Shot Test', player_id: '98765432', discord_username: 'shottest', current_server: '512', current_alliance: 'None',
    migrate_alliance: '710 (Bear 0200UTC and 1300UTC)', highest_troop_level: 'TG8', current_tg: '5,000', mystic_trial_stages: '120',
    total_power: '245,000,000', active_commit: 'Yes', willing_save_resources: 'Yes', participates_battles: 'Yes',
    spending_archetype: 'F2P (pure skills, always on)', main_language: 'English', willing_reduce_power: 'No', passes_required: '0', current_passes: '0', rendered_at: String(Date.now() - 60000),
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.append(k, v);
  fd.append('t11_units', 'No T11');
  for (let i = 0; i < count; i += 1) fd.append('screenshots', new File([PNG], `s${i}.png`, { type: 'image/png' }));
  for (const [k, v] of extra) fd.append(k, v);
  return { url: 'http://x/api/interest', headers: new Headers({ 'x-forwarded-for': `203.0.113.${ip++}` }), formData: async () => fd };
}
const rows = () => state.tables[COLLECTIONS.INTEREST_SUBMISSIONS] || [];
const listDir = async (dir) => (await fs.readdir(dir).catch(() => [])).sort();

function useConnectedDrive(drive) { setDriveStorageFactory(() => drive); }

test('screenshots go to Applications/<PlayerID>/ in Drive and the row keeps metadata only', async () => {
  const drive = await tmpFakeDrive();
  useConnectedDrive(drive);
  const res = await interest.POST(req({}, 2, [['client_request_id', 'shots-1']]));
  assert.equal(res.status, 200);
  const row = rows().at(-1);
  assert.equal(row.screenshot_files.length, 2);
  assert.deepEqual(row.screenshot_urls, []);
  assert.equal(row.screenshot_storage, 'drive');
  assert.ok(row.drive_folder_id);
  assert.ok(!JSON.stringify(row).includes('base64'));
  for (const f of row.screenshot_files) {
    assert.match(f.name, /^screenshot-\d-\d+\.png$/);
    assert.equal(f.mime, 'image/png');
    assert.equal(f.size, PNG.length);
    assert.equal(f.folder_id, row.drive_folder_id);
  }
  const files = await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Applications', '98765432'));
  assert.equal(files.length, 2);
});

test('a second submission by the same player reuses the same folder', async () => {
  const drive = await tmpFakeDrive();
  useConnectedDrive(drive);
  await interest.POST(req({}, 1, [['client_request_id', 'same-player-a']]));
  const first = rows().at(-1).drive_folder_id;
  await interest.POST(req({}, 1, [['client_request_id', 'same-player-b']]));
  assert.equal(rows().at(-1).drive_folder_id, first);
  const apps = await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Applications'));
  assert.deepEqual(apps, ['98765432']);
});

test('retry with the same client_request_id creates no duplicate row, folder or files', async () => {
  const drive = await tmpFakeDrive();
  useConnectedDrive(drive);
  const before = rows().length;
  const a = await (await interest.POST(req({ player_id: '11223344' }, 2, [['client_request_id', 'retry-1']]))).json();
  const b = await (await interest.POST(req({ player_id: '11223344' }, 2, [['client_request_id', 'retry-1']]))).json();
  assert.equal(a.reference, b.reference);
  assert.equal(rows().length, before + 1);
  assert.equal((await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Applications', '11223344'))).length, 2);
});

test('a half-finished first attempt resumes without re-uploading finished files', async () => {
  const drive = await tmpFakeDrive();
  useConnectedDrive(drive);
  const real = drive.uploadFile.bind(drive);
  let calls = 0;
  drive.uploadFile = async (a) => { calls += 1; if (calls === 2) throw new Error('boom'); return real(a); };
  const id = 'resume-1';
  await interest.POST(req({ player_id: '55667788' }, 2, [['client_request_id', id]]));
  // first file in Drive, second kept in the database fallback (still done, not lost)
  let row = rows().at(-1);
  assert.equal(row.screenshot_files.length, 1);
  assert.equal(row.screenshot_urls.length, 1);
  assert.equal(row.screenshot_storage, 'mixed');
  drive.uploadFile = real;
  // simulate a crash after the first upload: row is still 'pending'
  row.screenshot_state = 'pending'; row.screenshot_urls = [];
  await interest.POST(req({ player_id: '55667788' }, 2, [['client_request_id', id]]));
  row = rows().at(-1);
  assert.equal(row.screenshot_files.length, 2);
  assert.equal((await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Applications', '55667788'))).length, 2);
});

test('Drive not connected: the application is still saved, screenshots wait in the database (storage db)', async () => {
  const drive = await tmpFakeDrive();
  drive.getStatus = async () => ({ connected: false });
  useConnectedDrive(drive);
  const res = await interest.POST(req({ player_id: '22334455' }, 2, [['client_request_id', 'down-1']]));
  assert.equal(res.status, 200);
  const row = rows().at(-1);
  assert.equal(row.screenshot_storage, 'db');
  assert.equal(row.screenshot_files.length, 0);
  assert.equal(row.screenshot_urls.length, 2);
  assert.ok(row.screenshot_urls.every((u) => u.startsWith('data:image/png;base64,')));
  assert.deepEqual(await listDir(path.join(drive.root, 'tree')), []);
});

test('Drive throwing is handled the same way as not connected', async () => {
  const drive = await tmpFakeDrive();
  drive.uploadFile = async () => { throw new Error('Drive down'); };
  useConnectedDrive(drive);
  const res = await interest.POST(req({ player_id: '33445566' }, 1, [['client_request_id', 'down-2']]));
  assert.equal(res.status, 200);
  assert.equal(rows().at(-1).screenshot_storage, 'db');
});

test('non-numeric Player ID and path tricks never become folder names', async () => {
  const drive = await tmpFakeDrive();
  useConnectedDrive(drive);
  await interest.POST(req({ player_id: '../../etc' }, 1, [['client_request_id', 'trick-1']]));
  const apps = await listDir(path.join(drive.root, 'tree', 'K710 Website', 'Applications'));
  assert.deepEqual(apps, ['unknown-player-id']);
});

test('migration moves waiting screenshots to Drive, verifies, drops base64 and is idempotent', async () => {
  const drive = await tmpFakeDrive();
  drive.getStatus = async () => ({ connected: false });
  useConnectedDrive(drive);
  await interest.POST(req({ player_id: '66778899' }, 2, [['client_request_id', 'mig-1']]));
  const row = rows().at(-1);
  assert.equal(row.screenshot_urls.length, 2);
  const real = await tmpFakeDrive();
  const tree = createFolderTree({ drive: real, memory: new Map(), pending: new Map() });
  // the in-memory test collection needs $regex support for the waiting filter
  const coll = {
    find: () => { const c = { sort: () => c, limit: () => c, toArray: async () => rows().filter((r) => (r.screenshot_urls || []).some((u) => u.startsWith('data:'))) }; return c; },
    countDocuments: async () => rows().filter((r) => (r.screenshot_urls || []).some((u) => u.startsWith('data:'))).length,
    updateOne: async (f, u) => Object.assign(rows().find((r) => r.id === f.id), u.$set),
  };
  const result = await migrateInterestBatch({ coll, drive: real, tree, batchSize: 50 });
  assert.ok(result.migrated.includes(row.id));
  assert.equal(result.remaining, 0);
  assert.equal(row.screenshot_files.length, 2);
  assert.deepEqual(row.screenshot_urls, []);
  assert.equal(row.screenshot_storage, 'drive');
  assert.equal((await listDir(path.join(real.root, 'tree', 'K710 Website', 'Applications', '66778899'))).length, 2);
  const again = await migrateInterestBatch({ coll, drive: real, tree });
  assert.deepEqual(again.migrated, []);
});

test('admin screenshot proxy: admin only, streams from Drive, never exposes Drive ids', async () => {
  const drive = await tmpFakeDrive();
  useConnectedDrive(drive);
  await interest.POST(req({ player_id: '77889900' }, 1, [['client_request_id', 'proxy-1']]));
  const row = rows().at(-1);
  const params = { params: Promise.resolve({ id: row.id, index: '0' }) };
  const anon = await shot.GET({ cookies: { get: () => undefined }, headers: new Headers() }, params);
  assert.equal(anon.status, 401);
  assert.doesNotMatch(await anon.text(), new RegExp(row.screenshot_files[0].drive_file_id));
  const token = await mintAdminToken();
  const ok = await shot.GET({ cookies: { get: (k) => (k === 'tff_admin_session' ? { value: token } : undefined) }, headers: new Headers() }, params);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.match(ok.headers.get('cache-control'), /private/);
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
  for (const h of ok.headers.values()) assert.ok(!h.includes(row.screenshot_files[0].drive_file_id));
});
