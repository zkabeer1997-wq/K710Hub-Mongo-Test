import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { driveHookLoad, driveHookResolve, tmpFakeDrive } from './helpers/driveTestHooks.mjs';

const state = { tables: {}, down: false };
globalThis.__heroTest = state;
registerHooks({
  resolve(s, c, next) {
    { const r = driveHookResolve(s, c, next); if (r) return r; }
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:hero-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:hero-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    { const l = driveHookLoad(u); if (l) return l; }
    if (u === 'test:hero-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:hero-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; const m=createFakeMongo(globalThis.__heroTest.tables); export const ensureIndexes=m.ensureIndexes; export const getCollection=async(n)=>{ if(globalThis.__heroTest.down) throw new Error('mongo down'); return m.getCollection(n); };` };
    }
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'hero-admin-test-only';
process.env.MEMBER_SESSION_SECRET = 'hero-member-test-only';
const cat = await import('../lib/heroCatalog.mjs');
const server = await import('../lib/heroCatalog.server.js');
const adminRoute = await import('../app/api/admin-heroes/route.js');
const publicRoute = await import('../app/api/heroes/route.js');
const imagesRoute = await import('../app/api/admin-drive/images/route.js');
const kvkRoute = await import('../app/api/kvk-availability/route.js');
const dragonRoute = await import('../app/api/flamedragon/route.js');
const { sanitizeKvkTroops, troopFieldsOf, resolveTroopPrefill } = await import('../lib/kvkAvailability.mjs');
const { sanitizeFlamedragonInput, currentHeroesOnly } = await import('../lib/flamedragonForm.mjs');
const { HEROES } = await import('../lib/playerCombatOptions.mjs');
const { setDriveStorageFactory } = await import('../lib/driveStorage.server.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');
const { createMemberToken } = await import('../lib/memberAuth.js');
const { loadDragonFallback } = await import('../lib/memberPrefill.server.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=', 'base64');
const adminToken = await mintAdminToken();
const memberToken = await createMemberToken('m1');
const drive = await tmpFakeDrive();
setDriveStorageFactory(() => drive);
const req = ({ admin = true, member = false, body = {}, url = 'http://localhost/api/x', form = null } = {}) => ({
  url, headers: new Headers(), json: async () => body, formData: async () => form,
  cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: adminToken } : member && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; state.down = false; server.invalidateHeroCatalog(); };
const names = (heroes) => heroes.map((h) => h.name);
const upload = async (name = 'p.png') => {
  const form = new FormData(); form.set('folder', 'hero'); form.set('alt', 'Hero'); form.set('file', new File([PNG], name, { type: 'image/png' }));
  const res = await imagesRoute.POST(req({ form })); assert.equal(res.status, 201); return (await res.json()).image;
};

test('seed: lazily created from code defaults, ten removed heroes inactive, order stable', async () => {
  reset();
  const all = await server.getHeroCatalog().list();
  assert.equal(all.length, 20);
  assert.deepEqual(all.filter((h) => h.active).map((h) => h.name), HEROES);
  assert.deepEqual(all.filter((h) => !h.active).map((h) => h.name), cat.REMOVED_HEROES);
  assert.equal(state.tables.hero_catalog.length, 20);
  const longFei = all.find((h) => h.name === 'Long Fei');
  assert.equal(longFei.key, 'long-fei');
  assert.equal(cat.publicHero(longFei).default_url, '/heroes/long-fei.webp');
  await server.getHeroCatalog().list(); // second read does not reseed
  assert.equal(state.tables.hero_catalog.length, 20);
});

test('reads are cached ~30s, invalidated on writes, and fail open', async () => {
  reset();
  let t = 0;
  const calls = { n: 0 };
  const coll = (await import('./helpers/fakeMongo.mjs')).createFakeMongo(state.tables);
  const local = cat.createHeroCatalog({ getColl: async () => { calls.n += 1; if (state.down) throw new Error('down'); return coll.getCollection('hero_catalog'); }, clock: () => t });
  assert.equal((await local.list()).length, 20);
  const afterFirst = calls.n;
  t = 10_000; await local.list();
  assert.equal(calls.n, afterFirst, 'served from cache inside the TTL');
  await local.update('chenko', { active: false });
  assert.ok(!(await local.activeNames()).includes('Chenko'), 'write invalidates the cache');
  t = 100_000; state.down = true;
  assert.ok(!(await local.activeNames()).includes('Chenko'), 'stale cache beats defaults when Mongo is down');
  const cold = cat.createHeroCatalog({ getColl: async () => { throw new Error('down'); } });
  assert.deepEqual(await cold.activeNames(), HEROES, 'no cache + Mongo down: code defaults');
  assert.ok((await cold.publicList()).every((h) => h.image_url === null && h.default_url));
  state.down = false;
});

test('validators use the catalog list: active ok, inactive/unknown rejected, saved-but-inactive dropped', () => {
  const allowed = ['Chenko', 'Nova'];
  assert.deepEqual(sanitizeKvkTroops({ heroes: ['Nova', 'Chenko', 'Nova'] }, { allowedHeroes: allowed }).fields.heroes, ['Nova', 'Chenko']);
  assert.ok(sanitizeKvkTroops({ heroes: ['Saul'] }, { allowedHeroes: allowed }).error, 'inactive hero chosen fresh is rejected');
  assert.ok(sanitizeKvkTroops({ heroes: ['Nobody'] }, { allowedHeroes: allowed }).error);
  const kept = sanitizeKvkTroops({ heroes: ['Saul', 'Chenko'] }, { allowedHeroes: allowed, existingHeroes: ['Saul'] });
  assert.equal(kept.error, null);
  assert.deepEqual(kept.fields.heroes, ['Chenko'], 'previously saved, now inactive: dropped, never a 400');
  assert.equal(sanitizeKvkTroops({ heroes: ['Saul'] }).error, null, 'without a catalog the built-in list still applies');
  assert.deepEqual(troopFieldsOf({ heroes: ['Saul', 'Nova'] }, allowed).heroes, ['Nova']);
  assert.deepEqual(resolveTroopPrefill([{ row: { heroes: ['Saul', 'Nova'] }, from: 'record' }], allowed).heroes, ['Nova']);
  assert.deepEqual(currentHeroesOnly(['Saul', 'Nova'], allowed), ['Nova']);
  const dragon = sanitizeFlamedragonInput({ name: 'A', member_id: 'm1', pin: 'x', heroes: ['Saul', 'Nova'] }, { existingHeroes: ['Saul'], allowedHeroes: allowed });
  assert.deepEqual(dragon.heroes, ['Nova']);
  assert.throws(() => sanitizeFlamedragonInput({ name: 'A', member_id: 'm1', pin: 'x', heroes: ['Saul'] }, { existingHeroes: [], allowedHeroes: allowed }));
});

test('migration safety: every hero saved under the old static list still validates with the seeded catalog', async () => {
  reset();
  const allowed = await server.getActiveHeroNames();
  assert.deepEqual(allowed, HEROES);
  assert.equal(sanitizeKvkTroops({ heroes: HEROES }, { allowedHeroes: allowed }).error, null);
  assert.equal(sanitizeFlamedragonInput({ name: 'A', member_id: 'm1', pin: 'x', heroes: HEROES }, { allowedHeroes: allowed }).heroes.length, HEROES.length);
});

test('admin-heroes API: anonymous callers are rejected on every method', async () => {
  reset();
  for (const call of [() => adminRoute.GET(req({ admin: false })), () => adminRoute.POST(req({ admin: false, body: { name: 'X' } })), () => adminRoute.PATCH(req({ admin: false, body: { key: 'saul' } })), () => adminRoute.DELETE(req({ admin: false, url: 'http://l/api/admin-heroes?key=saul' }))]) {
    assert.equal((await call()).status, 401);
  }
  const member = await adminRoute.GET(req({ admin: false, member: true }));
  assert.equal(member.status, 401);
  assert.equal(state.tables.hero_catalog, undefined, 'no seeding for an unauthorised call');
});

test('admin-heroes API: create, rename, toggle, reorder, delete; forms follow immediately', async () => {
  reset();
  let res = await adminRoute.GET(req());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).heroes.length, 20);

  res = await adminRoute.POST(req({ body: { name: '  Nova   Star ' } }));
  assert.equal(res.status, 201);
  assert.ok(names((await res.json()).heroes).includes('Nova Star'));
  assert.equal((await adminRoute.POST(req({ body: { name: 'nova star' } }))).status, 409, 'duplicate (case-insensitive)');
  assert.equal((await adminRoute.POST(req({ body: { name: '' } }))).status, 400);
  assert.equal((await adminRoute.POST(req({ body: { name: '<b>x</b>' } }))).status, 400);

  // public list updates at once (cache invalidated) and never leaks Drive ids
  let pub = await (await publicRoute.GET()).json();
  assert.ok(names(pub.heroes).includes('Nova Star'));
  assert.ok(!JSON.stringify(pub).includes('drive_file_id'));
  assert.equal(pub.heroes.length, 11);

  // unsaved hero can be renamed and deleted
  assert.equal((await adminRoute.PATCH(req({ body: { key: 'nova-star', name: 'Nova' } }))).status, 200);
  assert.ok(names((await (await publicRoute.GET()).json()).heroes).includes('Nova'));

  // hero a member saved cannot be renamed (forms remember the name); removal is always allowed (see below)
  state.tables.submissions = [{ member_id: 'm9', heroes: ['Saul'] }];
  const blocked = await adminRoute.PATCH(req({ body: { key: 'saul', name: 'Saul II' } }));
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /add Saul II as a new hero/);
  const off = await adminRoute.PATCH(req({ body: { key: 'saul', active: false } }));
  assert.equal(off.status, 200);
  assert.ok(!names((await (await publicRoute.GET()).json()).heroes).includes('Saul'));
  const adminList = (await off.json()).heroes;
  assert.equal(adminList.find((h) => h.key === 'saul').saved_count, 1);

  // reorder
  const keys = adminList.map((h) => h.key).reverse();
  assert.equal((await adminRoute.PATCH(req({ body: { order: keys } }))).status, 200);
  assert.equal((await (await publicRoute.GET()).json()).heroes[0].name, 'Nova');

  assert.equal((await adminRoute.DELETE(req({ url: 'http://l/api/admin-heroes?key=nova-star' }))).status, 200);
  assert.equal((await adminRoute.PATCH(req({ body: { key: 'ghost', active: true } }))).status, 404);
});

test('hero image: attach, replace (old file trashed), remove; only hero-folder images are accepted', async () => {
  reset();
  const first = await upload('a.png');
  let res = await adminRoute.PATCH(req({ body: { key: 'chenko', image_id: first.id } }));
  assert.equal(res.status, 200);
  let chenko = (await res.json()).heroes.find((h) => h.key === 'chenko');
  assert.equal(chenko.image_url, `/api/site-image/${first.id}`);
  assert.equal(chenko.image.id, first.id);
  let pub = (await (await publicRoute.GET()).json()).heroes.find((h) => h.key === 'chenko');
  assert.equal(pub.image_url, `/api/site-image/${first.id}`);
  assert.equal(pub.default_url, '/heroes/chenko.webp', 'static default stays as the fallback');
  assert.deepEqual(Object.keys(pub).sort(), ['default_url', 'image_url', 'key', 'name']);

  const second = await upload('b.png');
  await adminRoute.PATCH(req({ body: { key: 'chenko', image_id: second.id } }));
  assert.equal(state.tables.site_images.some((d) => String(d._id) === first.id), false, 'replaced image record removed');
  assert.equal(state.tables.site_images.some((d) => String(d._id) === second.id), true);

  assert.equal((await adminRoute.PATCH(req({ body: { key: 'chenko', image_id: '00000000-0000-4000-8000-000000000000' } }))).status, 400);
  state.tables.site_images.push({ _id: 'tool-img', folder: 'tool' });
  assert.equal((await adminRoute.PATCH(req({ body: { key: 'chenko', image_id: 'tool-img' } }))).status, 400, 'tool images are not hero images');

  res = await adminRoute.PATCH(req({ body: { key: 'chenko', image_id: null } }));
  chenko = (await res.json()).heroes.find((h) => h.key === 'chenko');
  assert.equal(chenko.image_url, null);
  assert.equal(chenko.default_url, '/heroes/chenko.webp');
});

test('KvK Availability route: catalog list drives save validation and load/prefill', async () => {
  reset();
  state.tables.submissions = [{ member_id: 'm1', name: 'Ann', current_alliance: '710', availability: 'Full battle (12-17 UTC)', heroes: ['Saul', 'Chenko'] }];
  await adminRoute.PATCH(req({ body: { key: 'saul', active: false } }));
  await adminRoute.POST(req({ body: { name: 'Nova' } }));
  const memberReq = (body) => ({ ...req({ admin: false, member: true, body }), headers: new Headers() });
  const loaded = await (await kvkRoute.GET(memberReq())).json();
  assert.deepEqual(loaded.row && loaded.prefill.heroes, ['Chenko'], 'inactive Saul dropped from prefill');
  const base = { name: 'Ann', member_id: 'm1', current_alliance: '710', availability: 'Full battle (12-17 UTC)' };
  // re-saving with the stale inactive hero never errors (silently dropped)
  let res = await kvkRoute.POST(memberReq({ ...base, heroes: ['Saul', 'Chenko', 'Nova'] }));
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(state.tables.submissions[0].heroes, ['Chenko', 'Nova']);
  // choosing an inactive hero that was never saved is rejected
  res = await kvkRoute.POST(memberReq({ ...base, heroes: ['Thrud', 'Yeonwoo'] }));
  assert.equal(res.status, 400);
  // an admin-added hero validates
  res = await kvkRoute.POST(memberReq({ ...base, heroes: ['Nova'] }));
  assert.equal(res.status, 200);
});

test('Flamedragon route + fallback use the catalog', async () => {
  reset();
  await adminRoute.PATCH(req({ body: { key: 'saul', active: false } }));
  state.tables.submissions = [{ member_id: 'm1', name: 'Ann', current_alliance: '710', heroes: ['Saul', 'Chenko'], infantry_tier: 'T11' }];
  const fb = await loadDragonFallback('m1');
  assert.deepEqual(fb.heroes, ['Chenko']);
  state.tables.flamedragon_forms = [{ member_id: 'm1', name: 'Ann', heroes: ['Saul', 'Chenko'] }];
  const memberReq = (body) => ({ ...req({ admin: false, member: true, body }), headers: new Headers() });
  const got = await (await dragonRoute.GET(memberReq())).json();
  assert.deepEqual(got.record.heroes, ['Chenko']);
  const res = await dragonRoute.POST(memberReq({ name: 'Ann', heroes: ['Saul', 'Chenko'] }));
  assert.equal(res.status, 200, await res.clone().text());
});

test('public /api/heroes fails open to the built-in list when MongoDB is down', async () => {
  reset();
  state.down = true;
  const body = await (await publicRoute.GET()).json();
  assert.deepEqual(names(body.heroes), HEROES);
  assert.ok(body.heroes.every((h) => h.default_url && h.image_url === null));
  const res = await adminRoute.GET(req());
  assert.equal(res.status, 503, 'admin read reports the outage instead of showing defaults as if editable');
});

const fakeColl = async (name) => (await import('./helpers/fakeMongo.mjs')).createFakeMongo(state.tables).getCollection(name);
const newCatalog = () => cat.createHeroCatalog({ getColl: () => fakeColl('hero_catalog'), getRemovedColl: () => fakeColl('hero_catalog_removed'), ttlMs: 0 });

test('seed is idempotent and race-proof: 10 simultaneous cold catalogs and 10 GETs create each hero once', async () => {
  reset();
  const lists = await Promise.all(Array.from({ length: 10 }, () => newCatalog().list()));
  assert.ok(lists.every((l) => l.length === 20));
  assert.equal(state.tables.hero_catalog.length, 20);
  assert.equal(new Set(state.tables.hero_catalog.map((d) => d.name_norm)).size, 20);
  reset();
  const gets = await Promise.all(Array.from({ length: 10 }, () => adminRoute.GET(req())));
  assert.ok(gets.every((r) => r.status === 200));
  assert.equal(state.tables.hero_catalog.length, 20);
});

test('names are unique by normalised name (case, accents, spaces, punctuation) at the API', async () => {
  reset();
  assert.equal(cat.heroNameNorm('Long Fei'), 'longfei');
  assert.equal(cat.heroNameNorm('LÓNG-fei'), 'longfei');
  assert.equal((await adminRoute.POST(req({ body: { name: 'Longfei' } }))).status, 409);
  assert.equal((await adminRoute.POST(req({ body: { name: 'SAUL' } }))).status, 409);
  assert.equal((await adminRoute.POST(req({ body: { name: 'S a u l' } }))).status, 409);
  assert.equal((await adminRoute.PATCH(req({ body: { key: 'chenko', name: 'Sául' } }))).status, 409);
  assert.equal((await adminRoute.POST(req({ body: { name: 'Brand New' } }))).status, 201);
  assert.equal(state.tables.hero_catalog.find((d) => d.key === 'brand-new').name_norm, 'brandnew');
});

test('live scenario: every hero stored twice (racing seed) is shown once, pickers and validators see no duplicates', async () => {
  reset();
  await server.getHeroCatalog().list();
  const base = state.tables.hero_catalog.map((d, i) => ({ ...d }));
  const copies = base.map((d, i) => ({ ...d, _id: `dup${i}`, key: `${d.key}-2`, name_norm: undefined, created_at: new Date(Date.now() + 1000), order: d.order + 100 }));
  copies.forEach((c) => { delete c.name_norm; });
  state.tables.hero_catalog = [...copies, ...base]; // duplicates first: order of rows must not matter
  server.invalidateHeroCatalog();
  const pub = (await (await publicRoute.GET()).json()).heroes;
  assert.deepEqual(names(pub), HEROES);
  assert.equal(new Set(pub.map((h) => h.key)).size, pub.length);
  const adminList = (await (await adminRoute.GET(req())).json());
  assert.equal(adminList.heroes.length, 20);
  assert.equal(adminList.duplicates, 20);
  assert.deepEqual(await server.getActiveHeroNames(), HEROES);
  // an image on only the duplicate row wins over a bare original
  state.tables.hero_catalog.find((d) => d._id === 'dup0').image = { site_image_id: 'img-x' };
  server.invalidateHeroCatalog();
  assert.equal((await server.getHeroCatalog().list()).find((h) => h.name === base[0].name).image.site_image_id, 'img-x');
  // admin "Remove duplicates" cleans the collection, keeps the image, backfills name_norm
  const res = await adminRoute.POST(req({ body: { action: 'dedupe' } }));
  assert.equal(res.status, 200);
  assert.equal(state.tables.hero_catalog.length, 20);
  assert.equal((await res.json()).duplicates, 0);
  assert.equal(state.tables.hero_catalog.find((d) => d.name === base[0].name).image.site_image_id, 'img-x');
  assert.ok(state.tables.hero_catalog.every((d) => d.name_norm));
  assert.equal((await adminRoute.POST(req({ admin: false, body: { action: 'dedupe' } }))).status, 401);
});

test('planHeroDedupe / dedupeHeroCollection: dry run changes nothing, --yes keeps best row and merges image + active', async () => {
  reset();
  const old = new Date('2026-01-01'); const young = new Date('2026-06-01');
  state.tables.hero_catalog = [
    { _id: 'a', key: 'saul', name: 'Saul', active: false, order: 3, created_at: young, image: null },
    { _id: 'b', key: 'saul-2', name: 'saul', active: true, order: 9, created_at: young, image: null },
    { _id: 'c', key: 'longfei', name: 'LongFei', active: true, order: 1, created_at: old, image: { site_image_id: 'img-1' } },
    { _id: 'd', key: 'long-fei', name: 'Long Fei', active: true, order: 2, created_at: old, image: null },
    { _id: 'e', key: 'nova', name: 'Nova', active: true, order: 4, created_at: old, image: null },
  ];
  const coll = await fakeColl('hero_catalog');
  const dry = await cat.dedupeHeroCollection(coll);
  assert.equal(dry.applied, false);
  assert.equal(dry.duplicateGroups, 2);
  assert.equal(state.tables.hero_catalog.length, 5, 'dry run writes nothing');
  assert.ok(state.tables.hero_catalog.every((d) => !d.name_norm));
  const done = await cat.dedupeHeroCollection(coll, { apply: true });
  assert.equal(done.applied, true);
  const rows = state.tables.hero_catalog;
  assert.deepEqual(rows.map((d) => d._id).sort(), ['b', 'c', 'e'], 'active beats inactive; image beats bare');
  assert.equal(rows.find((d) => d._id === 'c').image.site_image_id, 'img-1');
  assert.ok(rows.every((d) => d.name_norm));
  assert.equal((await cat.dedupeHeroCollection(coll, { apply: true })).removed.length, 0, 'idempotent');
});

test('remove: always allowed (even when members saved it), tombstone stops re-seeding, image trashed, member answers untouched', async () => {
  reset();
  state.tables.submissions = [{ member_id: 'm9', heroes: ['Saul', 'Nova'] }];
  state.tables.flamedragon_forms = [{ member_id: 'm9', heroes: ['Saul'] }];
  const img = await upload('s.png');
  await adminRoute.PATCH(req({ body: { key: 'saul', image_id: img.id } }));
  let res = await adminRoute.DELETE(req({ url: 'http://l/api/admin-heroes?key=saul' }));
  assert.equal(res.status, 200);
  let body = await res.json();
  assert.ok(!names(body.heroes).includes('Saul'));
  assert.deepEqual(body.removed.map((r) => r.name), ['Saul']);
  assert.equal(state.tables.site_images.some((d) => String(d._id) === img.id), false, 'uploaded image moved to trash');
  assert.deepEqual(state.tables.submissions[0].heroes, ['Saul', 'Nova'], 'saved answers untouched');
  assert.deepEqual(state.tables.flamedragon_forms[0].heroes, ['Saul']);
  assert.ok(!names((await (await publicRoute.GET()).json()).heroes).includes('Saul'));
  assert.equal((await adminRoute.DELETE(req({ url: 'http://l/api/admin-heroes?key=saul' }))).status, 404);
  assert.equal((await adminRoute.DELETE(req({ admin: false, url: 'http://l/api/admin-heroes?key=chenko' }))).status, 401);

  // a cold start with an emptied catalog (every hero removed) never brings removed heroes back
  for (const h of [...body.heroes]) await adminRoute.DELETE(req({ url: `http://l/api/admin-heroes?key=${h.key}` }));
  assert.equal(state.tables.hero_catalog.length, 0);
  server.invalidateHeroCatalog();
  assert.deepEqual(await newCatalog().list(), [], 'seed skips tombstoned names');
  assert.equal(state.tables.hero_catalog.length, 0);
});

test('removed heroes are dropped on load and never a 400 on re-save; restore and re-add bring them back', async () => {
  reset();
  state.tables.submissions = [{ member_id: 'm1', name: 'Ann', current_alliance: '710', availability: 'Full battle (12-17 UTC)', heroes: ['Saul', 'Chenko'] }];
  await adminRoute.DELETE(req({ url: 'http://l/api/admin-heroes?key=saul' }));
  const memberReq = (body) => ({ ...req({ admin: false, member: true, body }), headers: new Headers() });
  const loaded = await (await kvkRoute.GET(memberReq())).json();
  assert.deepEqual(loaded.prefill.heroes, ['Chenko']);
  const base = { name: 'Ann', member_id: 'm1', current_alliance: '710', availability: 'Full battle (12-17 UTC)' };
  const saved = await kvkRoute.POST(memberReq({ ...base, heroes: ['Saul', 'Chenko'] }));
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await kvkRoute.POST(memberReq({ ...base, heroes: ['Saul'] }))).status, 400, 'a removed hero chosen fresh is rejected like an inactive one');

  assert.equal((await adminRoute.POST(req({ admin: false, body: { action: 'restore', key: 'saul' } }))).status, 401);
  assert.equal((await adminRoute.POST(req({ body: { action: 'restore', key: 'ghost' } }))).status, 404);
  const res = await adminRoute.POST(req({ body: { action: 'restore', key: 'saul' } }));
  assert.equal(res.status, 200);
  const back = await res.json();
  assert.deepEqual(back.removed, []);
  assert.ok(names(back.heroes).includes('Saul'));
  assert.ok(names((await (await publicRoute.GET()).json()).heroes).includes('Saul'));
  assert.equal(state.tables.hero_catalog.filter((d) => d.name === 'Saul').length, 1);

  // removing again, then adding the same name clears the tombstone
  await adminRoute.DELETE(req({ url: 'http://l/api/admin-heroes?key=saul' }));
  assert.equal((await adminRoute.POST(req({ body: { name: 'saul' } }))).status, 201);
  assert.deepEqual((await (await adminRoute.GET(req())).json()).removed, []);
});

test('picker output never contains duplicates even if defaults and DB rows overlap', async () => {
  reset();
  const dup = cat.publicHeroes([...cat.defaultCatalogDocs(), ...cat.defaultCatalogDocs().map((d) => ({ ...d, key: `${d.key}-x`, name: d.name.toUpperCase() }))]);
  assert.deepEqual(names(dup), HEROES);
  assert.deepEqual(cat.activeHeroNames([...cat.defaultCatalogDocs(), ...cat.defaultCatalogDocs()]), HEROES);
});
