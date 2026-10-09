import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';

const state = { tables: {} };
globalThis.__rallyExportTest = state;
registerHooks({
  resolve(s, c, next) {
    { const r = driveHookResolve(s, c, next); if (r) return r; }
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:re-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:re-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    { const l = driveHookLoad(u); if (l) return l; }
    if (u === 'test:re-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:re-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__rallyExportTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'rally-export-test-only';
const route = await import('../app/api/admin-rally-export/route.js');
const rallyRoute = await import('../app/api/admin-rallies/route.js');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');

const token = await mintAdminToken();
const req = ({ admin = true, body = {}, url = 'http://x/api/admin-rally-export' } = {}) => ({
  url, json: async () => body,
  headers: new Headers(),
  cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: token } : undefined) },
});
const drive = await tmpFakeDrive();
setDriveStorageFactory(() => drive);

test('rally export needs an admin', async () => {
  assert.equal((await route.GET(req({ admin: false, url: 'http://x/api/admin-rally-export?type=kvk' }))).status, 401);
  assert.equal((await route.POST(req({ admin: false, body: { type: 'kvk' } }))).status, 401);
  assert.equal((await route.POST(req({ body: { type: 'nope' } }))).status, 400);
});

test('saved rallies round trip their new fields and export into one reusable Drive sheet', async () => {
  const members = ['1', '2', '3'].map((id, i) => ({
    member_id: id, name: `Member ${id}`, current_alliance: '710', availability: ['Full battle (12-17 UTC)', 'First half (12-14:30 UTC)', 'Not Available'][i],
    infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG7', archer_tier: 'T11', archer_tg: 'TG6',
  }));
  const put = await rallyRoute.PUT(req({ body: { rallies: [{
    id: 'a', name: 'Danko', memberIds: ['1', '2'], leadMemberId: '', managerName: 'Zain', rallyType: 'garrison', formationKind: 'archer', notes: 'Reinforce & Pass Castle',
    troopWeights: {}, leadHeroes: {}, leadHeroAssignments: {},
  }] } }));
  assert.equal(put.status, 200);
  const got = await (await rallyRoute.GET(req())).json();
  assert.equal(got.rallies[0].managerName, 'Zain');
  assert.equal(got.rallies[0].rallyType, 'garrison');
  assert.equal(got.rallies[0].formationKind, 'archer');
  assert.equal(got.rallies[0].notes, 'Reinforce & Pass Castle');
  assert.deepEqual(got.rallies[0].memberIds, ['1', '2'], 'joiner order is kept');
  assert.ok(got.saved_at);

  // The current cycle's roster: the route reads whatever the cycle holds.
  const cycles = state.tables[COLLECTIONS.EVENT_CYCLES] || [];
  const cycle = cycles.find((c) => c.type === 'kvk' && c.is_current);
  assert.ok(cycle, 'a current KvK cycle exists');
  state.tables[COLLECTIONS.SUBMISSIONS] = members.map((m) => ({ ...m, event_cycle_id: String(cycle._id) }));

  const xlsxRes = await route.GET(req({ url: 'http://x/api/admin-rally-export?type=kvk' }));
  assert.equal(xlsxRes.status, 200);
  assert.match(xlsxRes.headers.get('Content-Disposition'), /k710-rally-teams-kvk-\d{4}-\d{2}-\d{2}\.xlsx/);
  const bytes = new Uint8Array(await xlsxRes.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');

  const first = await (await route.POST(req({ body: { type: 'kvk' } }))).json();
  assert.equal(first.updated, false);
  assert.match(first.url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/.+\/edit$/);
  assert.equal(first.rallyCount, 1);
  const second = await (await route.POST(req({ body: { type: 'kvk' } }))).json();
  assert.equal(second.updated, true, 'later exports overwrite the same sheet');
  assert.equal(second.url, first.url, 'the shared link stays valid');
  const copy = await (await route.POST(req({ body: { type: 'kvk', mode: 'copy' } }))).json();
  assert.notEqual(copy.url, first.url, 'Save as new copy makes another sheet');
  const again = await (await route.POST(req({ body: { type: 'kvk' } }))).json();
  assert.equal(again.url, first.url, 'a copy does not replace the remembered sheet');
});
