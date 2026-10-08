import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__perCycleTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:pc-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:pc-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:pc-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:pc-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__perCycleTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'per-cycle-test-only';
process.env.ADMIN_PASSWORD = 'per-cycle-admin-only';
const control = await import('../app/api/admin-event-control/route.js');
const prepRoute = await import('../app/api/prep-backpack/route.js');
const nobleRoute = await import('../app/api/noble-advisor/route.js');
const adminPrep = await import('../app/api/admin-prep-backpack/route.js');
const adminNoble = await import('../app/api/admin-noble-advisor/route.js');
const statusRoute = await import('../app/api/member-form-status/route.js');
const availRoute = await import('../app/api/kvk-availability/route.js');
const dragonRoute = await import('../app/api/flamedragon/route.js');
const cycles = await import('../lib/eventCycles.server.js');
const { COLLECTIONS: T } = await import('../lib/mongoCollections.js');
const { computeFormStatuses } = await import('../lib/memberForms.mjs');

const adminToken = await mintAdminToken();
const memberToken = await createMemberToken('m1');
const req = ({ body = {}, as = 'member', url = 'http://x/api' } = {}) => ({
  url,
  json: async () => body,
  cookies: { get: (k) => (as === 'admin' && k === 'tff_admin_session' ? { value: adminToken } : as === 'member' && k === 'k710_member_session' ? { value: memberToken } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; cycles.resetCycleBackfillCache(); };
const startCycle = async (type, label) => control.POST(req({ as: 'admin', body: { type, action: 'start_cycle', label } }));
const statuses = async () => Object.fromEntries((await (await statusRoute.GET(req())).json()).forms.map((f) => [f.key, f]));
const PREP = { in_game_name: 'Ann', want_construction: 'Yes', avail_day1: ['12:00'] };
const NOBLE = { in_game_name: 'Ann', want_troop_training: 'Yes', is_transfer: 'No', troop_speedup_days: '5', promoting_t11: 'No', avail_day4: ['00:00'] };

test('computeFormStatuses: carriedOver only when not done this cycle and an earlier answer exists', () => {
  const by = Object.fromEntries(computeFormStatuses({
    gates: {},
    submissions: { joiner: '2026-10-01T00:00:00Z' },
    cycleInfo: { joiner: { cycleLabel: 'KvK 2', previousLabel: 'KvK 1' }, prep: { cycleLabel: 'KvK 2', previousLabel: 'KvK 1' }, noble: { cycleLabel: 'FD 2' } },
  }).map((s) => [s.key, s]));
  assert.equal(by.joiner.submitted, true);
  assert.equal(by.joiner.carriedOver, false);
  assert.equal(by.prep.carriedOver, true);
  assert.equal(by.prep.needsInput, true);
  assert.equal(by.prep.previousLabel, 'KvK 1');
  assert.equal(by.prep.cycleLabel, 'KvK 2');
  assert.equal(by.noble.carriedOver, false);
  assert.equal(by.lead.cycleLabel, null);
});

test('legacy untagged rows are backfilled into the OLDEST cycle, idempotently', async () => {
  reset();
  state.tables[T.PREP_BACKPACK] = [{ member_id: 'm1', in_game_name: 'Old' }];
  state.tables[T.NOBLE_ADVISOR] = [{ member_id: 'm1', in_game_name: 'Old' }];
  state.tables[T.SUBMISSIONS] = [{ member_id: 'm1', name: 'Old', availability: 'Full battle (12-17 UTC)' }];
  const first = await cycles.getCurrentEventCycle('kvk');
  await cycles.getCurrentEventCycle('flamedragon');
  assert.equal(state.tables[T.PREP_BACKPACK][0].event_cycle_id, first.id);
  assert.equal(state.tables[T.SUBMISSIONS][0].event_cycle_id, first.id);
  const fd = await cycles.getCurrentEventCycle('flamedragon');
  assert.equal(state.tables[T.NOBLE_ADVISOR][0].event_cycle_id, fd.id);
  // a later cycle does not steal them, and re-running changes nothing
  await startCycle('kvk', 'KvK 2');
  cycles.resetCycleBackfillCache();
  await cycles.backfillCycleTags('kvk');
  assert.equal(state.tables[T.PREP_BACKPACK][0].event_cycle_id, first.id);
  assert.equal(state.tables[T.PREP_BACKPACK].length, 1);
});

test('prep + noble: one row per cycle, new cycle shows not done with previous, old rows kept', async () => {
  reset();
  assert.equal((await prepRoute.POST(req({ body: PREP }))).status, 200);
  assert.equal((await nobleRoute.POST(req({ body: NOBLE }))).status, 200);
  assert.equal((await prepRoute.POST(req({ body: { ...PREP, notes: 'again' } }))).status, 200);
  assert.equal(state.tables[T.PREP_BACKPACK].length, 1, 'same cycle overwrites');
  let s = await statuses();
  assert.equal(s.prep.submitted, true);
  assert.equal(s.noble.submitted, true);
  assert.equal(s.prep.carriedOver, false);
  const oldKvk = (await cycles.getCurrentEventCycle('kvk')).id;
  const oldFd = (await cycles.getCurrentEventCycle('flamedragon')).id;

  await startCycle('kvk', 'KvK 2');
  await startCycle('flamedragon', 'FD 2');
  s = await statuses();
  for (const k of ['prep', 'noble']) {
    assert.equal(s[k].needsInput, true, k);
    assert.equal(s[k].submitted, false, k);
    assert.equal(s[k].carriedOver, true, k);
  }
  assert.equal(s.prep.previousLabel, 'First cycle');
  assert.equal(s.prep.cycleLabel, 'KvK 2');
  assert.equal(s.lead.carriedOver, false);

  const got = await (await prepRoute.GET(req())).json();
  assert.equal(got.record, null);
  assert.equal(got.previous.notes, 'again');
  assert.equal(got.cycle.label, 'KvK 2');
  assert.equal('_id' in got.previous, false);
  const gotNoble = await (await nobleRoute.GET(req())).json();
  assert.equal(gotNoble.record, null);
  assert.equal(gotNoble.previous.want_troop_training, 'Yes');

  assert.equal((await prepRoute.POST(req({ body: { ...PREP, notes: 'cycle two' } }))).status, 200);
  assert.equal((await nobleRoute.POST(req({ body: NOBLE }))).status, 200);
  assert.equal(state.tables[T.PREP_BACKPACK].length, 2);
  assert.equal(state.tables[T.NOBLE_ADVISOR].length, 2);
  s = await statuses();
  assert.equal(s.prep.submitted, true);
  assert.equal(s.prep.carriedOver, false);
  assert.equal((await (await prepRoute.GET(req())).json()).record.notes, 'cycle two');

  // admin API: default = current cycle, cycle=<old id> = old rows
  let admin = await (await adminPrep.GET(req({ as: 'admin' }))).json();
  assert.deepEqual(admin.rows.map((r) => r.notes), ['cycle two']);
  admin = await (await adminPrep.GET(req({ as: 'admin', url: `http://x/api/admin-prep-backpack?cycle=${oldKvk}` }))).json();
  assert.deepEqual(admin.rows.map((r) => r.notes), ['again']);
  assert.equal(admin.cycles.length, 2);
  assert.equal((await adminPrep.GET(req({ as: 'admin', url: 'http://x/api?cycle=bogus' }))).status, 404);
  const nobleOld = await (await adminNoble.GET(req({ as: 'admin', url: `http://x/api/admin-noble-advisor?cycle=${oldFd}` }))).json();
  assert.equal(nobleOld.rows.length, 1);
  assert.equal((await adminPrep.GET(req({ as: 'member' }))).status, 401);
});

test('archiving and starting cycles never delete prep/noble rows; history counts per form', async () => {
  reset();
  await prepRoute.POST(req({ body: PREP }));
  await nobleRoute.POST(req({ body: NOBLE }));
  const arch = await control.POST(req({ as: 'admin', body: { type: 'kvk', action: 'archive_reset', confirm: true } }));
  assert.equal(arch.status, 200);
  await startCycle('kvk', 'KvK 2');
  assert.equal(state.tables[T.PREP_BACKPACK].length, 1);
  const st = await (await control.GET(req({ as: 'admin', url: 'http://x/api/admin-event-control?type=kvk' }))).json();
  assert.equal(st.history[0].forms_submitted.prep, 1);
  assert.equal(st.counts.forms_submitted.prep, 0);
  await startCycle('flamedragon', 'FD 2');
  const fd = await (await control.GET(req({ as: 'admin', url: 'http://x/api/admin-event-control?type=flamedragon' }))).json();
  assert.equal(fd.history[0].forms_submitted.noble, 1);
});

test('joiner + dragon behave the same for members: not done after a new cycle, previous offered', async () => {
  reset();
  state.tables[T.SUBMISSIONS] = [{ member_id: 'm1', name: 'Ann', pin_hash: 'secret' }];
  const body = { name: 'Ann', member_id: 'm1', current_alliance: '710', availability: 'Full battle (12-17 UTC)' };
  assert.equal((await availRoute.POST(req({ body }))).status, 200);
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', infantry_tier: 'T10' } }))).status, 200);
  let s = await statuses();
  assert.equal(s.joiner.submitted, true);
  assert.equal(s.dragon.submitted, true);

  await startCycle('kvk', 'KvK 2');
  await startCycle('flamedragon', 'FD 2');
  s = await statuses();
  for (const k of ['joiner', 'dragon']) {
    assert.equal(s[k].needsInput, true, k);
    assert.equal(s[k].carriedOver, true, k);
    assert.equal(s[k].previousLabel, 'First cycle', k);
  }
  const a = await (await availRoute.GET(req())).json();
  assert.equal(a.record, null);
  assert.equal(a.previous.availability, body.availability);
  assert.equal(JSON.stringify(a).includes('secret'), false);
  const d = await (await dragonRoute.GET(req())).json();
  assert.equal(d.record, null);
  assert.equal(d.previous.infantry_tier, 'T10');

  assert.equal((await availRoute.POST(req({ body }))).status, 200);
  assert.equal((await dragonRoute.POST(req({ body: { name: 'Ann', infantry_tier: 'T11' } }))).status, 200);
  s = await statuses();
  assert.equal(s.joiner.submitted, true);
  assert.equal(s.dragon.carriedOver, false);
  // the earlier answers are still there as snapshots, and still offered as `previous`
  assert.equal(state.tables[T.EVENT_CYCLE_SNAPSHOTS].filter((x) => x.event_type === 'flamedragon').length >= 1, true);
  assert.equal((await (await dragonRoute.GET(req())).json()).previous.infantry_tier, 'T10');
});
