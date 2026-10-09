import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';

const state = { tables: {} };
globalThis.__identityTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:id-mongo', shortCircuit: true };
    if (s === 'next/cache') return { url: 'test:id-cache', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (s.startsWith('.') && !/\.(m?js|json)$/.test(s)) {
      try { return next(s + '.js', c); } catch { /* fall through */ }
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:id-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath=()=>{}; export const revalidateTag=()=>{};' };
    if (u === 'test:id-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__identityTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'identity-test-only';
const { getMemberIdentity, realNickname } = await import('../lib/memberPrefill.server.js');
const availRoute = await import('../app/api/kvk-availability/route.js');
const profileRoute = await import('../app/api/power-profile/route.js');
const dragonRoute = await import('../app/api/flamedragon/route.js');
const prepRoute = await import('../app/api/prep-backpack/route.js');
const nobleRoute = await import('../app/api/noble-advisor/route.js');
const voteRoute = await import('../app/api/event-participation/route.js');
const requestsRoute = await import('../app/api/website-requests/route.js');
const { COLLECTIONS: T } = await import('../lib/mongoCollections.js');

const ME = '960000001';
const OTHER = '960000002';
const token = await createMemberToken(ME);
const req = (body = {}, url = 'http://x/api') => ({
  url,
  json: async () => body,
  headers: new Headers(),
  cookies: { get: (k) => (k === 'k710_member_session' ? { value: token } : undefined) },
});
const reset = () => { for (const k of Object.keys(state.tables)) delete state.tables[k]; };
const rows = (t) => state.tables[t] || [];
const FRESH = () => { reset(); state.tables.kingshot_users = [{ player_id: ME, nickname: 'Test Fresh', alliance_abbr: '710' }]; };

const SIX = { infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG6', archer_tier: 'T11', archer_tg: 'TG7' }; // troop tier + TG are required on both member forms
test('identity: a real Kingshot nickname wins over saved names', async () => {
  FRESH();
  state.tables[T.POWER_PROFILES] = [{ member_id: ME, name: 'Old Profile', updated_at: new Date() }];
  const id = await getMemberIdentity({ memberId: ME });
  assert.deepEqual(id, { memberId: ME, name: 'Test Fresh', alliance: '710', source: 'kingshot' });
});

test('identity: placeholder nicknames are ignored, newest saved name used', async () => {
  for (const placeholder of ['', `Governor ${ME}`, 'governor  960000001', ME, '   ']) {
    FRESH();
    state.tables.kingshot_users[0].nickname = placeholder;
    state.tables[T.POWER_PROFILES] = [{ member_id: ME, name: 'Profile Name', updated_at: new Date('2026-01-01') }];
    state.tables[T.PREP_BACKPACK] = [{ member_id: ME, in_game_name: 'Prep Name', updated_at: new Date('2026-05-01') }];
    state.tables[T.NOBLE_ADVISOR] = [{ member_id: ME, in_game_name: 'Noble Name', updated_at: new Date('2026-03-01') }];
    const id = await getMemberIdentity({ memberId: ME });
    assert.equal(id.name, 'Prep Name', `placeholder ${JSON.stringify(placeholder)}`);
    assert.equal(id.source, 'saved');
    assert.equal(id.memberId, ME);
  }
});

test('identity: nothing known gives an empty name, never the id; no session gives an empty identity', async () => {
  FRESH();
  state.tables.kingshot_users[0].nickname = `Governor ${ME}`;
  const id = await getMemberIdentity({ memberId: ME });
  assert.equal(id.name, '');
  assert.equal(id.source, null);
  assert.equal(id.memberId, ME);
  assert.deepEqual(await getMemberIdentity(null), { memberId: '', name: '', alliance: '', source: null });
  assert.equal(realNickname('Governor 12345', '12345'), '');
  assert.equal(realNickname('Real Name', '12345'), 'Real Name');
});

test('KvK Availability: brand-new member saves; body/query member_id is ignored', async () => {
  FRESH();
  const get = await availRoute.GET(req());
  assert.equal(get.status, 200);
  const data = await get.json();
  assert.equal(data.identity.name, 'Test Fresh');
  assert.equal(data.identity.memberId, ME);
  const res = await availRoute.POST(req({ name: 'Test Fresh', member_id: OTHER, current_alliance: '710', availability: 'Full battle (12-17 UTC)', ...SIX }));
  assert.equal(res.status, 200);
  assert.equal(rows(T.SUBMISSIONS).length, 1);
  assert.equal(rows(T.SUBMISSIONS)[0].member_id, ME);
  const again = await (await availRoute.GET(req())).json();
  assert.equal(again.row.name, 'Test Fresh');
  assert.equal(again.record.availability, 'Full battle (12-17 UTC)');
});

test('Power Profile: brand-new member saves under the session id; a ?member_id= is ignored', async () => {
  FRESH();
  const res = await profileRoute.POST(req({ name: 'Test Fresh', member_id: OTHER, pet_power: '5' }));
  assert.equal(res.status, 200);
  assert.equal(rows(T.POWER_PROFILES).length, 1);
  assert.equal(rows(T.POWER_PROFILES)[0].member_id, ME);
  const get = await (await profileRoute.GET(req({}, `http://x/api/power-profile?member_id=${OTHER}`))).json();
  assert.equal(get.profile.member_id, ME);
  const noBodyId = await profileRoute.POST(req({ name: 'Test Fresh', pet_power: '6' }));
  assert.equal(noBodyId.status, 200);
});

test('Flamedragon: brand-new member saves; empty name falls back to the account name; spoofed id ignored', async () => {
  FRESH();
  const get = await (await dragonRoute.GET(req())).json();
  assert.equal(get.identity.name, 'Test Fresh');
  const res = await dragonRoute.POST(req({ name: '', member_id: OTHER, current_alliance: '710', availability: 'Full battle (12-17 UTC)', ...SIX }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const saved = rows(T.FLAMEDRAGON_FORMS);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].member_id, ME);
  assert.equal(saved[0].name, 'Test Fresh');
});

const PREP = { in_game_name: 'Test Fresh', want_construction: 'No', want_research: 'No', want_troop_training: 'No', avail_day1: [], avail_day2: [], avail_day4: [], avail_day5: [] };

test('Prep: brand-new member saves; spoofed id ignored; name falls back to the account name', async () => {
  FRESH();
  const get = await (await prepRoute.GET(req())).json();
  assert.equal(get.identity.name, 'Test Fresh');
  assert.equal(get.member_id, ME);
  const res = await prepRoute.POST(req({ ...PREP, member_id: OTHER, in_game_name: '' }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const saved = rows(T.PREP_BACKPACK);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].member_id, ME);
  assert.equal(saved[0].in_game_name, 'Test Fresh');
});

test('Noble Advisor: brand-new member saves; spoofed id ignored; name falls back to the account name', async () => {
  FRESH();
  const get = await (await nobleRoute.GET(req())).json();
  assert.equal(get.identity.name, 'Test Fresh');
  const body = { member_id: OTHER, in_game_name: '', want_troop_training: 'No', is_transfer: 'No', troop_speedup_days: '0', promoting_t11: 'No', avail_day4: ['12:00'] };
  const res = await nobleRoute.POST(req(body));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const saved = rows(T.NOBLE_ADVISOR);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].member_id, ME);
  assert.equal(saved[0].in_game_name, 'Test Fresh');
});

test('Website Requests: name comes from the account, never the id; spoofed id ignored', async () => {
  FRESH();
  const get = await (await requestsRoute.GET(req())).json();
  assert.equal(get.identity.name, 'Test Fresh');
  assert.equal(get.profile.member_id, ME);
  const res = await requestsRoute.POST(req({ member_id: OTHER, current_alliance: '710', section: 'Forms', message: 'Hello' }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const saved = rows(T.WEBSITE_REQUESTS);
  assert.equal(saved[0].member_id, ME);
  assert.equal(saved[0].name, 'Test Fresh');
});

test('Event vote: stored under the session id even when the body names another member', async () => {
  FRESH();
  const get = await voteRoute.GET(req({}, 'http://x/api/event-participation?form=swordland-showdown&member_id=' + OTHER));
  assert.ok([200, 404].includes(get.status));
  for (const row of rows(T.EVENT_PARTICIPATION)) assert.notEqual(row.member_id, OTHER);
});

// Page-level: every member form page passes the server identity down; no client reads ?member_id=.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('pages pass the server identity into each form and clients never read a member_id from the URL', () => {
  const pages = {
    'app/dashboard/form/page.js': 'identity={identity}',
    'app/prep-phase-backpack/page.js': 'identity={identity}',
    'app/flamedragon/page.js': 'identity={identity}',
    'app/power-profile/page.js': 'identity={identity}',
    'app/forms/requests/page.js': 'identity={identity}',
    'app/forms/flamedragon-tyrant/noble-advisor/page.js': 'identity={identity}',
  };
  for (const [file, needle] of Object.entries(pages)) {
    const src = read(file);
    assert.ok(src.includes(needle), `${file} passes identity`);
    assert.ok(/getPageIdentity|getMemberIdentity/.test(src), `${file} reads the identity on the server`);
  }
  for (const file of ['app/dashboard/PlayerRecordForm.js', 'app/dashboard/form/PlayerRecordFormClient.js', 'app/prep-phase-backpack/PrepBackpackClient.js', 'app/prep-phase-backpack/PrepBackpackForm.js', 'app/flamedragon/FlamedragonClient.js', 'app/power-profile/PowerProfileClient.js', 'app/forms/requests/WebsiteRequestForm.js']) {
    const src = read(file);
    assert.ok(!/get\('member_id'\)|initialMemberId/.test(src), `${file} does not take member_id from the URL`);
  }
  const shared = read('components/member/IdentityFields.jsx');
  assert.match(shared, /From your account\. Change it if it is wrong\./);
  assert.ok(!/<input[^>]*memberId/.test(shared), 'Member ID is never an input');
});
