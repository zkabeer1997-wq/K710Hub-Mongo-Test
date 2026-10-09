// Applicant verification on /interest: token rules, routes (game APIs stubbed at
// fetch, never the real services), POST /api/interest behaviour, and proof that
// member login / member guards are neither used nor reachable with an applicant
// cookie.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const state = { tables: {} };
globalThis.__applicantTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ap-mongo', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    try {
      return next(s, c);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && s.startsWith('.') && !/\.(m?js|json|node)$/.test(s)) return next(`${s}.js`, c);
      throw error;
    }
  },
  load(u, c, next) {
    if (u === 'test:ap-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__applicantTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'applicant-test-only-secret';
const { NextRequest } = await import('next/server.js');
const A = await import('../lib/applicantAuth.js');
const { createMemberToken, readMemberSession, MEMBER_COOKIE_NAME } = await import('../lib/memberAuth.js');
const { readKingshotSession } = await import('../lib/memberAuthKingshot.js');
const { openLoginFlow, sealLoginFlow, LOGIN_FLOW_COOKIE_NAME } = await import('../lib/kingshotLoginState.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const { resetInMemoryRateLimits } = await import('../lib/rateLimit.mjs');
const start = await import('../app/api/applicant/start/route.js');
const sendCode = await import('../app/api/applicant/send-code/route.js');
const verify = await import('../app/api/applicant/verify/route.js');
const session = await import('../app/api/applicant/session/route.js');
const logout = await import('../app/api/applicant/logout/route.js');
const interest = await import('../app/api/interest/route.js');
const memberStart = await import('../app/api/login/start/route.js');
const memberSend = await import('../app/api/login/send-code/route.js');
const memberVerify = await import('../app/api/login/verify/route.js');
const memberSession = await import('../app/api/session/route.js');
const { proxy } = await import('../proxy.js');

// ------------------------------------------------------------ game stub ----
const game = {};
function resetGame(over = {}) {
  Object.assign(game, {
    validCode: 'GOOD42', kid: 523, nick: 'Verified Vera', power: 245_000_000, mystic: 48_250, alliance: 'ABC', allianceName: 'Alpha Crew',
    searchOk: true, profileOk: true, ...over,
  });
}
resetGame();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('/auth/get_game_captcha')) return json({ code: 1 });
  if (u.includes('/auth/login')) {
    const body = JSON.parse(init.body);
    return body.captcha_code === game.validCode ? json({ code: 1, data: { token: 't' } }) : json({ code: 0, msg: 'bad' });
  }
  if (u.includes('/callback/get_role_info')) {
    const body = JSON.parse(init.body);
    return json({ code: 1, data: { user_data: [{ role_id: body.role_id, nickname: game.nick, section: game.kid, icon: '' }] } });
  }
  if (u.includes('/api/search')) {
    if (!game.searchOk) return json({}, 500);
    const q = new URL(u).searchParams.get('q');
    return json({ results: [{ fid: q, uid: '9001', kid: game.kid, nick_name: game.nick, aid: 7, alliance_abbr: game.alliance, power: game.power }] });
  }
  if (u.includes('/api/players/')) {
    if (!game.profileOk) return json({}, 500);
    return json({ uid: 9001, kid: game.kid, power: game.power, mystic_trial: game.mystic, alliance_abbr: game.alliance, alliance_name: game.allianceName, kills: 5 });
  }
  return json({ aliases: [] }, 404);
};

const tbl = (name) => (state.tables[name] ||= []);
let ipCounter = 1;
function ipFor() { return `192.0.2.${ipCounter++}`; }
function post(pathname, body, cookies = {}, ip = ipFor(), extraHeaders = {}) {
  const cookie = Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest(`http://localhost${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}), ...extraHeaders },
    body: JSON.stringify(body ?? {}),
  });
}
function get(pathname, cookies = {}) {
  const cookie = Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest(`http://localhost${pathname}`, { headers: cookie ? { cookie } : {} });
}
const cookieOf = (res, name) => res.cookies.get(name)?.value || '';

/** Runs the whole applicant flow for one player and returns the cookies. */
async function verifyApplicant(playerId = '700100200', ip = ipFor()) {
  const s = await start.POST(post('/api/applicant/start', { playerId }, {}, ip));
  assert.equal(s.status, 200);
  const flowCookie = cookieOf(s, A.APPLICANT_FLOW_COOKIE_NAME);
  const c = await sendCode.POST(post('/api/applicant/send-code', {}, { [A.APPLICANT_FLOW_COOKIE_NAME]: flowCookie }, ip));
  assert.equal(c.status, 200);
  const flow2 = cookieOf(c, A.APPLICANT_FLOW_COOKIE_NAME);
  const v = await verify.POST(post('/api/applicant/verify', { code: game.validCode }, { [A.APPLICANT_FLOW_COOKIE_NAME]: flow2 }, ip));
  return { v, applicant: cookieOf(v, A.APPLICANT_COOKIE_NAME), ip };
}

const snap = (over = {}) => ({ playerId: '700100200', nickname: 'Verified Vera', kingdomId: 523, allianceAbbr: 'ABC', allianceName: 'Alpha Crew', power: 245_000_000, mysticTrial: 48_250, fetchedAt: Date.now(), expiresAt: Date.now() + A.APPLICANT_TOKEN_TTL_MS, ...over });

// ------------------------------------------------------------------ token ----
test('applicant token: round trip, 3 hour life, tamper and expiry are rejected', () => {
  assert.equal(A.APPLICANT_TOKEN_TTL_MS, 3 * 60 * 60 * 1000);
  const token = A.createApplicantToken(snap());
  const ok = A.verifyApplicantToken(token);
  assert.equal(ok.playerId, '700100200');
  assert.equal(ok.mysticTrial, 48_250);
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), power: 1 })).toString('base64url');
  assert.equal(A.verifyApplicantToken(`${forged}.${sig}`), null, 'edited payload');
  assert.equal(A.verifyApplicantToken(`${payload}.${sig.slice(0, -2)}xx`), null, 'edited signature');
  assert.equal(A.verifyApplicantToken(''), null);
  assert.equal(A.verifyApplicantToken('garbage'), null);
  assert.equal(A.verifyApplicantToken(A.createApplicantToken(snap({ expiresAt: Date.now() - 1 }))), null, 'expired');
  assert.equal(A.verifyApplicantToken(token, Date.now() + 3 * 3600 * 1000 + 5000), null, 'expired later');
  assert.equal(A.verifyApplicantToken(A.createApplicantToken(snap({ kingdomId: null }))), null, 'no kingdom');
});

test('a token signed with a different secret is rejected', () => {
  const token = A.createApplicantToken(snap());
  const [payload] = token.split('.');
  const other = crypto.createHmac('sha256', 'some-other-secret').update(`${A.APPLICANT_SIGNING_PREFIX}${payload}`).digest('base64url');
  assert.equal(A.verifyApplicantToken(`${payload}.${other}`), null);
});

test('domain separation: a member token is never an applicant token and the reverse', async () => {
  const memberToken = await createMemberToken('700100200');
  assert.equal(A.verifyApplicantToken(memberToken), null);
  const applicantToken = A.createApplicantToken(snap());
  const asMemberCookie = { cookies: { get: (k) => (k === MEMBER_COOKIE_NAME ? { value: applicantToken } : undefined) } };
  assert.equal(await readMemberSession(asMemberCookie), null);
  assert.equal(await readKingshotSession(asMemberCookie), null);
  // Same secret, but a member-style signature over an applicant payload does not validate either.
  const [payload] = applicantToken.split('.');
  const memberStyle = crypto.createHash('sha256').update(`k710-member-v2:${payload}:${process.env.MEMBER_SESSION_SECRET}`).digest('hex');
  assert.equal(A.verifyApplicantToken(`${payload}.${memberStyle}`), null);
  assert.notEqual(A.APPLICANT_COOKIE_NAME, MEMBER_COOKIE_NAME);
  assert.notEqual(A.APPLICANT_FLOW_COOKIE_NAME, LOGIN_FLOW_COOKIE_NAME);
});

test('flow cookies are not interchangeable between applicant and member', () => {
  const flow = { playerId: '700100200', state: 'awaiting_game_confirmation', expiresAt: Date.now() + 60000, applicant: true };
  assert.equal(openLoginFlow(A.sealApplicantFlow(flow)), null, 'member code cannot open an applicant flow');
  assert.equal(A.openApplicantFlow(sealLoginFlow({ ...flow, applicant: undefined })), null, 'applicant code cannot open a member flow');
  assert.ok(A.openApplicantFlow(A.sealApplicantFlow(flow)));
});

// ----------------------------------------------------------------- routes ----
test('applicant flow works for ANY kingdom, sets only applicant cookies and writes no member data', async () => {
  const { v, applicant } = await verifyApplicant('700100200');
  assert.equal(v.status, 200);
  const body = await v.json();
  assert.equal(body.state, 'verified');
  assert.equal(body.profile.kingdomId, 523);
  assert.equal(body.profile.alliance, '[ABC] Alpha Crew');
  assert.equal(body.profile.power, 245_000_000);
  assert.equal(body.profile.mysticTrial, 48_250);
  assert.ok(applicant);
  const setCookies = v.headers.getSetCookie().join('\n');
  assert.match(setCookies, /k710_applicant=/);
  assert.match(setCookies, /HttpOnly/i);
  assert.match(setCookies, /SameSite=lax/i);
  assert.match(setCookies, /Max-Age=10800/);
  assert.doesNotMatch(setCookies, /k710_member_session|k710_kingshot_login=[^;]+/, 'no member cookie is ever set');
  assert.equal((tbl('kingshot_users')).length, 0);
  assert.equal((tbl('kingshot_sessions')).length, 0);
  assert.equal((tbl('kingshot_personal_codes')).length, 0);
  // Same player from kingdom 710 is allowed too.
  resetGame({ kid: 710 });
  const again = await verifyApplicant('700100201');
  assert.equal((await again.v.json()).profile.kingdomId, 710);
  resetGame();
});

test('session route reports verified / in-progress / none and ignores the member cookie', async () => {
  const { applicant } = await verifyApplicant('700100202');
  const ok = await (await session.GET(get('/api/applicant/session', { [A.APPLICANT_COOKIE_NAME]: applicant }))).json();
  assert.equal(ok.state, 'verified');
  assert.equal(ok.profile.playerId, '700100202');
  assert.equal(JSON.stringify(ok).includes('signingKey'), false);
  const memberOnly = await createMemberToken('700100202');
  assert.equal((await (await session.GET(get('/api/applicant/session', { [MEMBER_COOKIE_NAME]: memberOnly }))).json()).state, 'none');
  assert.equal((await (await session.GET(get('/api/applicant/session', { [A.APPLICANT_COOKIE_NAME]: applicant.slice(0, -3) + 'abc' }))).json()).state, 'none');
});

test('logout clears applicant cookies only and leaves the member cookie alone', async () => {
  const res = await logout.POST(post('/api/applicant/logout', {}, { [MEMBER_COOKIE_NAME]: 'm' }));
  const set = res.headers.getSetCookie().join('\n');
  assert.match(set, /k710_applicant=;/);
  assert.match(set, /k710_applicant_flow=;/);
  assert.doesNotMatch(set, /k710_member_session/);
});

test('wrong codes are counted, the 5th stops the flow, and only applicant_* events are recorded', async () => {
  const ip = ipFor();
  const s = await start.POST(post('/api/applicant/start', { playerId: '700100300' }, {}, ip));
  let flow = cookieOf(s, A.APPLICANT_FLOW_COOKIE_NAME);
  const c = await sendCode.POST(post('/api/applicant/send-code', {}, { [A.APPLICANT_FLOW_COOKIE_NAME]: flow }, ip));
  flow = cookieOf(c, A.APPLICANT_FLOW_COOKIE_NAME);
  for (let i = 1; i <= 4; i += 1) {
    const r = await verify.POST(post('/api/applicant/verify', { code: 'WRONG1' }, { [A.APPLICANT_FLOW_COOKIE_NAME]: flow }, ip));
    assert.equal(r.status, 401);
    assert.equal((await r.json()).retryAllowed, true);
    flow = cookieOf(r, A.APPLICANT_FLOW_COOKIE_NAME);
  }
  const last = await verify.POST(post('/api/applicant/verify', { code: 'WRONG1' }, { [A.APPLICANT_FLOW_COOKIE_NAME]: flow }, ip));
  assert.equal((await last.json()).retryAllowed, false);
  assert.equal(cookieOf(last, A.APPLICANT_FLOW_COOKIE_NAME), '');
  const types = new Set(tbl('kingshot_login_events').map((e) => e.event_type));
  for (const type of types) assert.match(type, /^applicant_/);
  assert.ok(types.has('applicant_verification_failed'));
  assert.equal(tbl('kingshot_login_events').some((e) => ['code_requested', 'verification_failed', 'login_success'].includes(e.event_type)), false);
});

test('code requests are rate limited (4 per player per hour) and expired flows are refused', async () => {
  const playerId = '700100400';
  let last;
  for (let i = 0; i < 5; i += 1) {
    const ip = ipFor();
    const s = await start.POST(post('/api/applicant/start', { playerId }, {}, ip));
    last = await sendCode.POST(post('/api/applicant/send-code', {}, { [A.APPLICANT_FLOW_COOKIE_NAME]: cookieOf(s, A.APPLICANT_FLOW_COOKIE_NAME) }, ip));
  }
  assert.equal(last.status, 429);
  assert.equal((await last.json()).code, 'CODE_LIMIT');
  assert.equal((await sendCode.POST(post('/api/applicant/send-code', {}))).status, 401);
  assert.equal((await verify.POST(post('/api/applicant/verify', { code: 'GOOD42' }))).status, 401);
  assert.equal((await start.POST(post('/api/applicant/start', { playerId: 'abc' }))).status, 400);
});

test('game data unreachable after a right code: no cookie, flow kept, clear message', async () => {
  resetGame({ profileOk: false });
  const ip = ipFor();
  const s = await start.POST(post('/api/applicant/start', { playerId: '700100500' }, {}, ip));
  const c = await sendCode.POST(post('/api/applicant/send-code', {}, { [A.APPLICANT_FLOW_COOKIE_NAME]: cookieOf(s, A.APPLICANT_FLOW_COOKIE_NAME) }, ip));
  const v = await verify.POST(post('/api/applicant/verify', { code: 'GOOD42' }, { [A.APPLICANT_FLOW_COOKIE_NAME]: cookieOf(c, A.APPLICANT_FLOW_COOKIE_NAME) }, ip));
  assert.equal(v.status, 502);
  const body = await v.json();
  assert.equal(body.code, 'STATS_UNAVAILABLE');
  assert.equal(body.retryAllowed, true);
  assert.equal(cookieOf(v, A.APPLICANT_COOKIE_NAME), '');
  resetGame();
});

test('null power and Mystic Trial from the game stay null in the snapshot', async () => {
  resetGame({ power: null, mystic: null });
  const { v, applicant } = await verifyApplicant('700100600');
  const body = await v.json();
  assert.equal(body.profile.power, null);
  assert.equal(body.profile.mysticTrial, null);
  assert.ok(applicant);
  resetGame();
});

// ------------------------------------------------------------- /api/interest ----
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
state.tables[COLLECTIONS.TRANSFER_INTAKE_PERIODS] = [{ _id: 'p1', id: 'p1', label: 'Test window', is_active: true }];
function interestReq(overrides = {}, { cookies = {}, extra = [], ip = ipFor() } = {}) {
  const fd = new FormData();
  const base = {
    in_game_name: 'Typed Name', player_id: '700100200', discord_username: 'typed', current_server: '512', current_alliance: 'TypedAlliance',
    migrate_alliance: '710 (Bear 0200UTC and 1300UTC)', highest_troop_level: 'TG8', current_tg: '5,000', mystic_trial_score: '111',
    total_power: '99,000,000', active_commit: 'Yes', willing_save_resources: 'Yes', participates_battles: 'Yes',
    spending_archetype: 'F2P (pure skills, always on)', main_language: 'English', willing_reduce_power: 'No', passes_required: '0', current_passes: '0',
    rendered_at: String(Date.now() - 60000), ...overrides,
  };
  for (const [k, v] of Object.entries(base)) if (v !== null) fd.append(k, v);
  fd.append('t11_units', 'No T11');
  fd.append('screenshots', new File([PNG], 'a.png', { type: 'image/png' }));
  for (const [k, v] of extra) fd.append(k, v);
  const cookie = Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
  const headers = new Headers({ 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) });
  return { url: 'http://x/api/interest', headers, cookies: { get: (k) => (cookies[k] ? { value: cookies[k] } : undefined) }, formData: async () => fd };
}
const rows = () => tbl(COLLECTIONS.INTEREST_SUBMISSIONS);
const rowFor = (playerId) => rows().filter((r) => r.player_id === playerId);
const cookiesFor = (token) => ({ [A.APPLICANT_COOKIE_NAME]: token });

test('verified submission: game values replace everything the browser sent', async () => {
  const { applicant } = await verifyApplicant('700200001');
  const res = await interest.POST(interestReq({ player_id: '999999', in_game_name: 'Fake', current_server: '999', current_alliance: 'Fake', total_power: '1', mystic_trial_score: '1' }, { cookies: cookiesFor(applicant) }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.verified, true);
  const [row] = rowFor('700200001');
  assert.equal(rowFor('999999').length, 0);
  assert.equal(row.in_game_name, 'Verified Vera');
  assert.equal(row.current_server, '523');
  assert.equal(row.current_alliance, '[ABC] Alpha Crew');
  assert.equal(row.total_power, '245000000');
  assert.equal(row.mystic_trial_score, '48250');
  assert.equal(row.mystic_trial_stages, undefined);
  assert.equal(row.discord_username, 'typed', 'unlocked answers still come from the form');
  assert.equal(row.verified, true);
  assert.equal(row.verified_source, 'kingshot_game');
  assert.ok(row.verified_at instanceof Date && row.stats_fetched_at instanceof Date);
  assert.equal(row.power_self_reported, false);
  assert.equal(row.mystic_self_reported, false);
  assert.equal(row.resubmitted_count, 0);
  assert.ok(row.first_submitted_at && row.updated_at);
});

test('verified submission with null power / Mystic Trial: typed values accepted, flagged self-reported, still validated', async () => {
  resetGame({ power: null, mystic: null });
  const { applicant } = await verifyApplicant('700200002');
  resetGame();
  const bad = await interest.POST(interestReq({ player_id: '1', total_power: 'lots' }, { cookies: cookiesFor(applicant) }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).field, 'total_power');
  const missing = await interest.POST(interestReq({ mystic_trial_score: null }, { cookies: cookiesFor(applicant) }));
  assert.equal(missing.status, 400);
  const ok = await interest.POST(interestReq({ total_power: '12.5M', mystic_trial_score: '2,000' }, { cookies: cookiesFor(applicant) }));
  assert.equal(ok.status, 200);
  const [row] = rowFor('700200002');
  assert.equal(row.total_power, '12500000');
  assert.equal(row.mystic_trial_score, '2000');
  assert.equal(row.verified, true);
  assert.equal(row.power_self_reported, true);
  assert.equal(row.mystic_self_reported, true);
  assert.equal(row.in_game_name, 'Verified Vera');
});

test('unverified submission: typed values stored, everything marked self-reported, a client-sent verified flag is ignored', async () => {
  const res = await interest.POST(interestReq({ player_id: '700200003' }, { extra: [['verified', 'true'], ['verified_at', '2020-01-01']] }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).verified, false);
  const [row] = rowFor('700200003');
  assert.equal(row.in_game_name, 'Typed Name');
  assert.equal(row.total_power, '99000000');
  assert.equal(row.mystic_trial_score, '111');
  assert.equal(row.verified, false);
  assert.equal(row.verified_at, null);
  assert.equal(row.verified_source, null);
  assert.equal(row.power_self_reported, true);
  assert.equal(row.mystic_self_reported, true);
  assert.equal(row.verified_by_client, undefined);
});

test('forged, expired, member and wrong-kind cookies all count as unverified', async () => {
  const forged = A.createApplicantToken(snap({ playerId: '700200004' })).slice(0, -3) + 'abc';
  const expired = A.createApplicantToken(snap({ playerId: '700200004', expiresAt: Date.now() - 1000 }));
  const member = await createMemberToken('700200004');
  for (const token of [forged, expired]) {
    const res = await interest.POST(interestReq({ player_id: '700200004' }, { cookies: cookiesFor(token) }));
    assert.equal(res.status, 200);
  }
  const memberRes = await interest.POST(interestReq({ player_id: '700200004' }, { cookies: { [MEMBER_COOKIE_NAME]: member } }));
  assert.equal(memberRes.status, 200);
  assert.ok(rowFor('700200004').every((r) => r.verified === false));
  assert.equal(rowFor('700200004')[0].resubmitted_count, 2, 'three unverified posts replaced one row');
});

test('later application for the same player and window replaces the earlier one and keeps first_submitted_at', async () => {
  const first = await (await interest.POST(interestReq({ player_id: '700200005', total_power: '1,000' }))).json();
  const [before] = rowFor('700200005');
  const second = await (await interest.POST(interestReq({ player_id: '700200005', total_power: '2,000', mystic_trial_score: '5' }))).json();
  assert.equal(rowFor('700200005').length, 1);
  assert.equal(second.reference, first.reference, 'same reference so the status page keeps working');
  assert.equal(second.resubmitted, true);
  const [after] = rowFor('700200005');
  assert.equal(after.total_power, '2000');
  assert.equal(after.mystic_trial_score, '5');
  assert.equal(after.resubmitted_count, 1);
  assert.equal(String(after.first_submitted_at), String(before.first_submitted_at));
  assert.ok(after.updated_at >= before.updated_at);
});

test('a resubmission keeps the admin note and decision, except a rejection which re-opens as pending', async () => {
  await interest.POST(interestReq({ player_id: '700200006' }));
  const [row] = rowFor('700200006');
  Object.assign(row, { status: 'normal', admin_note: 'good fit', decided_at: new Date() });
  await interest.POST(interestReq({ player_id: '700200006' }));
  assert.equal(rowFor('700200006')[0].status, 'normal');
  assert.equal(rowFor('700200006')[0].admin_note, 'good fit');
  Object.assign(rowFor('700200006')[0], { status: 'reject' });
  await interest.POST(interestReq({ player_id: '700200006' }));
  assert.equal(rowFor('700200006')[0].status, 'pending');
  assert.equal(rowFor('700200006')[0].previous_status, 'reject');
});

test('SECURITY: an unverified submission never overwrites a verified application', async () => {
  const { applicant } = await verifyApplicant('700200007');
  await interest.POST(interestReq({ player_id: '700200007' }, { cookies: cookiesFor(applicant) }));
  const [verifiedRow] = rowFor('700200007');
  const snapshotOfRow = JSON.stringify(verifiedRow);
  // Someone types this Player ID with no verification.
  const attack = await interest.POST(interestReq({ player_id: '700200007', in_game_name: 'Attacker', total_power: '1,000' }));
  assert.equal(attack.status, 200);
  assert.equal(JSON.stringify(rowFor('700200007').find((r) => r.id === verifiedRow.id)), snapshotOfRow, 'verified row untouched');
  const all = rowFor('700200007');
  assert.equal(all.length, 2);
  const shadow = all.find((r) => r.id !== verifiedRow.id);
  assert.equal(shadow.verified, false);
  assert.equal(shadow.unverified_duplicate_of, verifiedRow.id);
  assert.equal(shadow.in_game_name, 'Attacker');
  // A second unverified try replaces the shadow, not the verified row, and creates no third row.
  await interest.POST(interestReq({ player_id: '700200007', in_game_name: 'Attacker 2' }));
  assert.equal(rowFor('700200007').length, 2);
  assert.equal(rowFor('700200007').find((r) => r.id === shadow.id).in_game_name, 'Attacker 2');
  assert.equal(rowFor('700200007').find((r) => r.id === verifiedRow.id).in_game_name, 'Verified Vera');
  // The real owner verifying again overwrites their own verified row.
  await interest.POST(interestReq({ player_id: '700200007', discord_username: 'newer' }, { cookies: cookiesFor(applicant) }));
  const owner = rowFor('700200007').find((r) => r.id === verifiedRow.id);
  assert.equal(owner.discord_username, 'newer');
  assert.equal(owner.resubmitted_count, 1);
  assert.equal(owner.verified, true);
});

test('a verified submission replaces an earlier unverified one for the same player', async () => {
  await interest.POST(interestReq({ player_id: '700200008', in_game_name: 'Typed first' }));
  const { applicant } = await verifyApplicant('700200008');
  await interest.POST(interestReq({ player_id: '700200008' }, { cookies: cookiesFor(applicant) }));
  const all = rowFor('700200008');
  assert.equal(all.length, 1);
  assert.equal(all[0].verified, true);
  assert.equal(all[0].in_game_name, 'Verified Vera');
  assert.equal(all[0].resubmitted_count, 1);
});

test('legacy rows without the new fields are replaced cleanly and old screenshot metadata is kept, not deleted', async () => {
  tbl(COLLECTIONS.INTEREST_SUBMISSIONS).push({
    _id: 'legacy1', id: 'legacy-0000-0000', player_id: '700200009', intake_period_id: 'p1', in_game_name: 'Old', mystic_trial_stages: '120',
    created_at: new Date('2026-01-01'), status: 'pending', screenshot_files: [{ idx: 0, drive_file_id: 'drv1', name: 'screenshot-1.png' }], screenshot_urls: [],
  });
  await interest.POST(interestReq({ player_id: '700200009' }));
  const [row] = rowFor('700200009');
  assert.equal(row.id, 'legacy-0000-0000');
  assert.equal(row.mystic_trial_stages, undefined);
  assert.equal(row.mystic_trial_score, '111');
  assert.equal(String(row.first_submitted_at), String(new Date('2026-01-01')));
  assert.deepEqual(row.previous_screenshot_files.map((f) => f.drive_file_id), ['drv1']);
  assert.equal(row.screenshot_files.every((f) => f.drive_file_id !== 'drv1'), true);
});

test('idempotency by client_request_id still holds for verified retries', async () => {
  const { applicant } = await verifyApplicant('700200010');
  const a = await (await interest.POST(interestReq({}, { cookies: cookiesFor(applicant), extra: [['client_request_id', 'verified-req-1']] }))).json();
  const b = await (await interest.POST(interestReq({}, { cookies: cookiesFor(applicant), extra: [['client_request_id', 'verified-req-1']] }))).json();
  assert.equal(a.reference, b.reference);
  assert.equal(rowFor('700200010').length, 1);
  assert.equal(rowFor('700200010')[0].resubmitted_count, 0, 'a retry is not a resubmission');
});

test('the existing per-IP submit limit (5 per 10 minutes) still applies to verified and unverified alike', async () => {
  resetInMemoryRateLimits();
  const ip = '198.51.100.250';
  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await interest.POST(interestReq({ player_id: `7003000${i}` }, { ip }))).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

// -------------------------------------------- member side is untouched ----
test('an applicant cookie opens NO member door: guards, member APIs and proxy gates', async () => {
  const { applicant } = await verifyApplicant('700400001');
  const jar = { [A.APPLICANT_COOKIE_NAME]: applicant };
  const req = get('/api/session', jar);
  assert.equal(await readMemberSession(req), null);
  assert.equal(await readKingshotSession(req), null);
  const body = await (await memberSession.GET(req)).json();
  assert.notEqual(body.state, 'authenticated');
  for (const p of ['/tools', '/tools/anything', '/forms', '/forms/kvk-appointments', '/dashboard/form/x', '/power-profile', '/flamedragon', '/flamedragon/x', '/prep-phase-backpack']) {
    const res = await proxy(new NextRequest(`https://k710.example${p}`, { headers: { host: 'k710.example', cookie: `${A.APPLICANT_COOKIE_NAME}=${applicant}` } }));
    assert.equal(res.status, 307, p);
    assert.match(res.headers.get('location'), /\/dashboard\?next=/, p);
  }
  // A real member cookie still passes the same gate.
  const memberToken = await createMemberToken('700400002');
  const pass = await proxy(new NextRequest('https://k710.example/tools', { headers: { host: 'k710.example', cookie: `${MEMBER_COOKIE_NAME}=${memberToken}` } }));
  assert.notEqual(pass.status, 307);
  // And an admin area stays closed to the applicant cookie.
  const admin = await proxy(new NextRequest('https://k710.example/admin/dashboard', { headers: { host: 'k710.example', cookie: `${A.APPLICANT_COOKIE_NAME}=${applicant}` } }));
  assert.equal(admin.status, 307);
  assert.match(admin.headers.get('location'), /\/admin\/login/);
});

test('member login still works on the same stub and is independent from an applicant session in the same browser', async () => {
  resetGame({ kid: 710, nick: 'Member Max' });
  const { applicant } = await verifyApplicant('700500001');
  const ip = ipFor();
  const s = await memberStart.POST(post('/api/login/start', { playerId: '700500002' }, { [A.APPLICANT_COOKIE_NAME]: applicant }, ip));
  assert.equal(s.status, 200);
  const memberFlow = cookieOf(s, LOGIN_FLOW_COOKIE_NAME);
  assert.ok(memberFlow);
  assert.equal(cookieOf(s, A.APPLICANT_COOKIE_NAME), '', 'member login does not touch the applicant cookie');
  // An applicant verification started in between does not disturb the member flow cookie.
  await start.POST(post('/api/applicant/start', { playerId: '700500003' }, { [LOGIN_FLOW_COOKIE_NAME]: memberFlow }, ip));
  const c = await memberSend.POST(post('/api/login/send-code', {}, { [LOGIN_FLOW_COOKIE_NAME]: memberFlow, [A.APPLICANT_COOKIE_NAME]: applicant }, ip));
  assert.equal(c.status, 200);
  const v = await memberVerify.POST(post('/api/login/verify', { code: game.validCode }, { [LOGIN_FLOW_COOKIE_NAME]: cookieOf(c, LOGIN_FLOW_COOKIE_NAME), [A.APPLICANT_COOKIE_NAME]: applicant }, ip));
  assert.equal(v.status, 200);
  assert.ok(cookieOf(v, MEMBER_COOKIE_NAME), 'member cookie issued by the member route');
  assert.equal(tbl('kingshot_users').filter((u) => u.player_id === '700500002').length, 1);
  assert.equal(tbl('kingshot_users').some((u) => u.player_id === '700500001' || u.player_id === '700500003'), false, 'applicant players never become members');
  // The member's own throttle events were recorded under the member types, not the applicant ones.
  assert.ok(tbl('kingshot_login_events').some((e) => e.event_type === 'code_requested'));
  // Applicant cookie still valid afterwards.
  assert.equal((await (await session.GET(get('/api/applicant/session', { [A.APPLICANT_COOKIE_NAME]: applicant }))).json()).state, 'verified');
  // A non-710 account is still refused by MEMBER login (no change to member rules).
  resetGame({ kid: 523 });
  const ip2 = ipFor();
  const s2 = await memberStart.POST(post('/api/login/start', { playerId: '700500004' }, {}, ip2));
  const c2 = await memberSend.POST(post('/api/login/send-code', {}, { [LOGIN_FLOW_COOKIE_NAME]: cookieOf(s2, LOGIN_FLOW_COOKIE_NAME) }, ip2));
  const v2 = await memberVerify.POST(post('/api/login/verify', { code: game.validCode }, { [LOGIN_FLOW_COOKIE_NAME]: cookieOf(c2, LOGIN_FLOW_COOKIE_NAME) }, ip2));
  assert.equal(v2.status, 403);
  assert.equal((await v2.json()).code, 'KINGDOM_ACCESS_DENIED');
  resetGame();
});

test('static guard: only applicant code references the applicant cookies, and no member guard references applicant code', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const allowed = new Set([
    'lib/applicantAuth.js', 'lib/interestApplication.mjs', 'app/api/interest/route.js', 'components/interest/useApplicantVerify.js',
  ]);
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.next', '.git', 'tests', '.claude', 'i18n'].includes(entry.name)) walk(rel);
      } else if (/\.(js|mjs|jsx)$/.test(entry.name)) {
        const text = fs.readFileSync(path.join(root, rel), 'utf8');
        if (/k710_applicant|applicantAuth|APPLICANT_COOKIE_NAME/.test(text)) hits.push(rel);
      }
    }
  };
  for (const d of ['app', 'lib', 'components']) walk(d);
  const unexpected = hits.filter((f) => !allowed.has(f) && !f.startsWith('app/api/applicant/'));
  assert.deepEqual(unexpected, []);
  for (const memberFile of ['proxy.js', 'lib/memberAuth.js', 'lib/memberAuthKingshot.js', 'lib/kingshotLogin.js', 'lib/kingshotLoginState.js', 'lib/kingshotLoginAudit.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, memberFile), 'utf8'), /applicant/i, memberFile);
  }
  // The only cookie a member guard reads is the member cookie.
  assert.match(fs.readFileSync(path.join(root, 'lib/memberAuth.js'), 'utf8'), /cookies\.get\(MEMBER_COOKIE_NAME\)/);
});

test.after(() => { globalThis.fetch = realFetch; });
