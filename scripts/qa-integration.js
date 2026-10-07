/**
 * Real-MongoDB integration suite. Exercises the API routes and rendered pages of
 * a running server against a real database and verifies documents directly in
 * Mongo with the mongodb driver.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710_realtest \
 *   MEMBER_SESSION_SECRET=... ADMIN_PASSWORD=... SITE_URL=http://localhost:3120 \
 *   npm run build && npm run start -- -p 3120
 *   (same env) QA_BASE=http://localhost:3120 npm run db:indexes
 *   (same env) QA_BASE=http://localhost:3120 node scripts/qa-integration.js
 *
 * The server and this script MUST share the same MONGODB_* / secret env. Only use
 * a throwaway database: the script refuses a DB name without "test" unless
 * QA_FORCE=1. It creates data with member ids prefixed "rt-" and slugs prefixed
 * "rt-" and removes its own leftovers at start, so it is safe to re-run.
 * Prints PASS/FAIL per check, exits 1 on any failure.
 */
const crypto = require('crypto');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const { chromium } = require('playwright');

const B = process.env.QA_BASE || 'http://localhost:3120';
const SECRET = process.env.MEMBER_SESSION_SECRET || 'real-test-secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'real-admin-pass';
const DB_NAME = process.env.MONGODB_DB_NAME || 'k710hub';
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else { fail++; failures.push(name); }
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? ` — ${detail}` : ''}`);
};
const section = (t) => console.log(`\n== ${t}`);

function memberToken(memberId) {
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const payload = b64(JSON.stringify({ memberId, role: 'member', nonce: 'rt', exp: Date.now() + 3600e3 }));
  const sig = crypto.createHash('sha256').update(`k710-member-v2:${payload}:${SECRET}`).digest('hex');
  return `${payload}.${sig}`;
}
const memberCookieHeader = (id) => `k710_member_session=${memberToken(id)}`;

async function http(method, path, { cookie, json, form, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, redirect: 'manual' };
  if (cookie) init.headers.cookie = cookie;
  if (json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form) init.body = form;
  const res = await fetch(B + path, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, text, headers: res.headers };
}

async function adminLogin() {
  const bad = await http('POST', '/api/admin-login', { json: { password: 'wrong' } });
  ok('admin login: wrong password rejected (401)', bad.status === 401);
  const res = await fetch(B + '/api/admin-login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  ok('admin login: correct password 200', res.status === 200);
  const set = res.headers.getSetCookie().find((c) => c.startsWith('tff_admin_session='));
  ok('admin login: session cookie issued', !!set);
  return set ? set.split(';')[0] : '';
}

const hourOf = (slot) => `${slot.slice(0, 2)}:00`;
const isDup = (err) => err && err.code === 11000;

async function rawInsertExpectDup(coll, doc) {
  try { await coll.insertOne(doc); return false; } catch (e) { return isDup(e); }
}

(async () => {
  if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI (same as the server).'); process.exit(2); }
  if (!/test/i.test(DB_NAME) && process.env.QA_FORCE !== '1') {
    console.error(`Refusing to run against database "${DB_NAME}" (name must contain "test", or set QA_FORCE=1).`);
    process.exit(2);
  }
  const mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  const db = mongo.db(DB_NAME);
  const C = (n) => db.collection(n);

  const probe = await http('GET', '/api/deadlines').catch(() => null);
  if (!probe) { console.error(`Server not reachable at ${B}`); process.exit(2); }

  // ---- clean leftovers from a previous run
  const rtMember = { $regex: '^rt-' };
  await Promise.all([
    C('power_profiles').deleteMany({ member_id: rtMember }),
    C('member_tool_state').deleteMany({ member_id: rtMember }),
    C('event_participation').deleteMany({ member_id: rtMember }),
    C('kvk_appointment_applications').deleteMany({ member_id: rtMember }),
    C('kvk_appointment_assignments').deleteMany({}),
    C('kvk_appointment_cycles').deleteMany({}),
    C('kingshot_users').deleteMany({ player_id: rtMember }),
    C('kingshot_sessions').deleteMany({ player_id: rtMember }),
    C('kingshot_login_events').deleteMany({ player_id: rtMember }),
    C('kingshot_personal_codes').deleteMany({ player_id: rtMember }),
    C('kingshot_users').deleteMany({ player_id: rtMember }),
    C('kingshot_sessions').deleteMany({ player_id: rtMember }),
    C('events').deleteMany({ slug: { $regex: '^rt-' } }),
    C('kingdom_guides').deleteMany({ slug: { $regex: '^rt-' } }),
    C('interest_submissions').deleteMany({ in_game_name: 'RT Applicant' }),
    C('form_gates').deleteMany({}),
  ]);

  const adminCookie = await adminLogin();
  ok('admin API: unauthenticated request rejected', (await http('GET', '/api/admin-guides')).status === 401);

  const M1 = 'rt-m1'; const M2 = 'rt-m2'; const M3 = 'rt-m3';
  const c1 = memberCookieHeader(M1); const c2 = memberCookieHeader(M2); const c3 = memberCookieHeader(M3);

  // ============================================================ (1) Power Profile
  section('1. Power Profile');
  ok('PP: anon GET 401', (await http('GET', '/api/power-profile')).status === 401);
  ok('PP: anon POST 401', (await http('POST', '/api/power-profile', { json: { name: 'x', member_id: M1 } })).status === 401);
  ok('PP: other member GET 403', (await http('GET', `/api/power-profile?member_id=${M1}`, { cookie: c2 })).status === 403);
  ok('PP: other member POST 403', (await http('POST', '/api/power-profile', { cookie: c2, json: { name: 'Hijack', member_id: M1 } })).status === 403);
  const own0 = await http('GET', '/api/power-profile', { cookie: c1 });
  ok('PP: own GET 200 with null profile before create', own0.status === 200 && own0.body.profile === null);
  const create = await http('POST', '/api/power-profile', {
    cookie: c1,
    json: { name: 'RT One', member_id: M1, pet_power: '1234', masters_power: '5678', infantry_tier: 'T10', heroes: ['Amadeus'], pin: '1234', pin_hash: 'leak', secret: 'x' },
  });
  ok('PP: create -> 200 status=created', create.status === 200 && create.body.status === 'created', JSON.stringify(create.body));
  const update = await http('POST', '/api/power-profile', { cookie: c1, json: { name: 'RT One', member_id: M1, pet_power: '9999' } });
  ok('PP: update -> status=updated', update.status === 200 && update.body.status === 'updated', JSON.stringify(update.body));
  ok('PP: update returns new value', update.body?.profile?.pet_power === '9999');
  const ppDocs = await C('power_profiles').find({ member_id: M1 }).toArray();
  ok('PP: exactly one doc in Mongo', ppDocs.length === 1, `found ${ppDocs.length}`);
  ok('PP: doc has latest pet_power and updated_at', ppDocs[0]?.pet_power === '9999' && ppDocs[0]?.updated_at instanceof Date);
  ok('PP: pin / pin_hash / secret not stored', ppDocs[0] && !('pin' in ppDocs[0]) && !('pin_hash' in ppDocs[0]) && !('secret' in ppDocs[0]));
  const ownGet = await http('GET', '/api/power-profile', { cookie: c1 });
  ok('PP: own GET returns profile', ownGet.status === 200 && ownGet.body.profile?.member_id === M1);
  ok('PP: GET does not leak pin/_id', !/pin|_id/i.test(JSON.stringify(ownGet.body)));
  const mpp = await http('GET', '/api/member-power-profile', { cookie: c1 });
  ok('PP: /api/member-power-profile own GET 200, no leak', mpp.status === 200 && mpp.body.profile?.pet_power === '9999' && !/pin|_id/i.test(JSON.stringify(mpp.body)));
  ok('PP: /api/member-power-profile anon 401', (await http('GET', '/api/member-power-profile')).status === 401);
  ok('PP: POST validation (missing name) 400', (await http('POST', '/api/power-profile', { cookie: c1, json: { member_id: M1 } })).status === 400);

  // ============================================================ (2) tool state
  section('2. Tool state + Saved plan chip');
  ok('tool-state: anon GET 401', (await http('GET', '/api/tool-state/updated-charms')).status === 401);
  const put1 = await http('PUT', '/api/tool-state/updated-charms', { cookie: c1, json: { state: { level: 7, note: 'rt' } } });
  ok('tool-state: PUT old key updated-charms 200', put1.status === 200);
  const get1 = await http('GET', '/api/tool-state/updated-charms', { cookie: c1 });
  ok('tool-state: GET old key returns saved state', get1.status === 200 && get1.body.state?.level === 7 && !!get1.body.updatedAt);
  const put2 = await http('PUT', '/api/tool-state/charm-sailing-optimizer', { cookie: c1, json: { state: { wave: 3 } } });
  ok('tool-state: PUT alias route 200', put2.status === 200);
  const aliasDoc = await C('member_tool_state').findOne({ member_id: M1, tool_key: 'wavebound-charms' });
  ok('tool-state: alias stored under storage key wavebound-charms', !!aliasDoc && aliasDoc.state.wave === 3);
  ok('tool-state: no doc stored under the alias key', !(await C('member_tool_state').findOne({ member_id: M1, tool_key: 'charm-sailing-optimizer' })));
  const getAliasByStorage = await http('GET', '/api/tool-state/wavebound-charms', { cookie: c1 });
  ok('tool-state: storage key reads alias data', getAliasByStorage.body?.state?.wave === 3);
  await http('PUT', '/api/tool-state/charm-sailing-optimizer', { cookie: c1, json: { state: { wave: 4 } } });
  ok('tool-state: re-save upserts (one doc)', (await C('member_tool_state').countDocuments({ member_id: M1, tool_key: 'wavebound-charms' })) === 1);
  ok('tool-state: other member sees nothing', (await http('GET', '/api/tool-state/updated-charms', { cookie: c2 })).body?.state === null);
  ok('tool-state: invalid key 400', (await http('PUT', '/api/tool-state/Bad_Key!', { cookie: c1, json: { state: {} } })).status === 400);
  ok('tool-state: array state 400', (await http('PUT', '/api/tool-state/updated-charms', { cookie: c1, json: { state: [] } })).status === 400);
  const list = await http('GET', '/api/tool-state', { cookie: c1 });
  ok('tool-state: list includes both keys', list.status === 200 && ['updated-charms', 'wavebound-charms'].every((k) => list.body.plans.some((p) => p.tool_key === k)));
  const toolsMember = await http('GET', '/tools', { cookie: c1 });
  const chips = (toolsMember.text.match(/Saved plan/g) || []).length;
  ok('/tools renders "Saved plan" chips for the member (charms + charm sailing)', toolsMember.status === 200 && chips >= 2, `chips=${chips}`);
  const toolsOther = await http('GET', '/tools', { cookie: c2 });
  ok('/tools: other member has no chip', toolsOther.status === 200 && !/Saved plan/.test(toolsOther.text));
  const toolsAnon = await http('GET', '/tools');
  ok('/tools: anon has no chip', toolsAnon.status === 200 && !/Saved plan/.test(toolsAnon.text));

  // ============================================================ seed content via admin API
  section('Seed content (admin API)');
  const guideBody = ['# Intro', 'Opening paragraph. '.repeat(40), '## Section One', 'Words here. '.repeat(120), '## Section Two', 'More words. '.repeat(120), '## Section Three', 'Even more. '.repeat(120), '### Detail', 'Detail text. '.repeat(30)].join('\n\n');
  const gCreate = await http('POST', '/api/admin-guides', {
    cookie: adminCookie,
    json: { slug: 'rt-guide', title: 'RT Test Guide', category: 'Basics', description: 'A guide for the real-db test.', body: guideBody, position: 5, is_published: true, access_level: 'public', reviewed_by: 'Qa Reviewer' },
  });
  ok('guides admin: create 201', gCreate.status === 201, JSON.stringify(gCreate.body));
  ok('guides admin: duplicate slug 409', (await http('POST', '/api/admin-guides', { cookie: adminCookie, json: { slug: 'rt-guide', title: 'x', category: 'Basics', body: 'b', position: 1 } })).status === 409);
  ok('guides admin: invalid slug 400', (await http('POST', '/api/admin-guides', { cookie: adminCookie, json: { slug: 'Bad Slug', title: 'x', category: 'Basics', body: 'b', position: 1 } })).status === 400);
  const gDoc = await C('kingdom_guides').findOne({ slug: 'rt-guide' });
  ok('guides admin: doc in Mongo with reviewed_by', gDoc?.reviewed_by === 'Qa Reviewer' && gDoc.is_published === true);
  await http('POST', '/api/admin-guides', {
    cookie: adminCookie,
    json: { slug: 'rt-members-guide', title: 'RT Members Guide', category: 'Basics', description: 'Members only.', body: 'Members only body.', position: 6, is_published: true, access_level: 'members' },
  });
  await http('POST', '/api/admin-guides', {
    cookie: adminCookie,
    json: { slug: 'rt-draft-guide', title: 'RT Draft Guide', category: 'Basics', description: 'Draft.', body: 'Draft body.', position: 7, is_published: false },
  });

  const future = (h) => new Date(Date.now() + h * 3600e3).toISOString();
  const eCreate = await http('POST', '/api/admin-events', {
    cookie: adminCookie,
    json: { slug: 'rt-event', title: 'RT Test Event', kind: 'custom', description: 'Real db event', body_md: '## Plan\n\nBring friends.', starts_at: future(48), ends_at: future(50), recurrence_frequency: 'weekly', recurrence_interval: 2, published: true },
  });
  ok('events admin: create ok', eCreate.status === 200 && eCreate.body?.event?.slug === 'rt-event', JSON.stringify(eCreate.body));
  await http('POST', '/api/admin-events', {
    cookie: adminCookie,
    json: { slug: 'rt-draft-event', title: 'RT Draft Event', kind: 'custom', starts_at: future(72), published: false },
  });

  for (const [tag, times] of [['710', ['01:00', '13:00']], ['RED', ['02:00', '14:00']], ['SKY', ['03:00', '15:00']]]) {
    const r = await http('PUT', `/api/admin-alliances/${tag}`, { cookie: adminCookie, json: { bear_times_utc: times, timezone_focus: 'UTC', language: 'English' } });
    ok(`alliances admin: seed ${tag} bear times`, r.status === 200, JSON.stringify(r.body));
  }

  // kingshot user so the homepage can say "Welcome back, <name>"
  await C('kingshot_users').updateOne(
    { player_id: M3 },
    { $set: { player_id: M3, nickname: 'RealTester', kingdom_id: 710, alliance_abbr: '710', alliance_name: 'Seven Ten', access_role: 'member', avatar_url: '' } },
    { upsert: true },
  );

  // ============================================================ (6) ICS
  section('6. ICS + guides admin edit');
  const bearIcs = await http('GET', '/api/events/bear-hunt.ics?alliance=710');
  const validIcs = (t) => /^BEGIN:VCALENDAR\r?\n/.test(t) && /END:VCALENDAR\r?\n?$/.test(t) && (t.match(/BEGIN:VEVENT/g) || []).length === (t.match(/END:VEVENT/g) || []).length && /UID:/.test(t) && /DTSTART/.test(t) && /VERSION:2\.0/.test(t);
  ok('ICS: bear-hunt?alliance=710 public 200 + text/calendar', bearIcs.status === 200 && /text\/calendar/.test(bearIcs.headers.get('content-type') || ''));
  ok('ICS: bear-hunt valid, 2 VEVENTs with daily RRULE', validIcs(bearIcs.text) && (bearIcs.text.match(/BEGIN:VEVENT/g) || []).length === 2 && /RRULE:FREQ=DAILY/.test(bearIcs.text), bearIcs.text.slice(0, 200));
  ok('ICS: bear-hunt unknown alliance 404', (await http('GET', '/api/events/bear-hunt.ics?alliance=NOPE')).status === 404);
  ok('ICS: bear-hunt invalid alliance 400', (await http('GET', '/api/events/bear-hunt.ics?alliance=%3Cx%3E')).status === 400);
  ok('ICS: bear-hunt (all alliances) has 6 events', ((await http('GET', '/api/events/bear-hunt.ics')).text.match(/BEGIN:VEVENT/g) || []).length === 6);
  const evIcs = await http('GET', '/api/events/rt-event/ics');
  ok('ICS: stored event valid with weekly interval-2 RRULE', evIcs.status === 200 && validIcs(evIcs.text) && /RRULE:FREQ=WEEKLY;INTERVAL=2/.test(evIcs.text), evIcs.text.slice(0, 300));
  const defIcs = await http('GET', '/api/events/kvk-cycle/ics');
  ok('ICS: built-in default event (kvk-cycle) valid', defIcs.status === 200 && validIcs(defIcs.text) && /INTERVAL=4/.test(defIcs.text));
  ok('ICS: draft event is 404', (await http('GET', '/api/events/rt-draft-event/ics')).status === 404);
  ok('ICS: unknown event 404', (await http('GET', '/api/events/nope-nope/ics')).status === 404);

  const gPut = await http('PUT', '/api/admin-guides/rt-guide', {
    cookie: adminCookie,
    json: { slug: 'rt-guide', title: 'RT Test Guide', category: 'Basics', description: 'A guide for the real-db test.', body: guideBody, position: 5, is_published: true, access_level: 'public', reviewed_by: 'Second Reviewer' },
  });
  ok('guides admin: edit (PUT) 200', gPut.status === 200, JSON.stringify(gPut.body));
  const gDoc2 = await C('kingdom_guides').findOne({ slug: 'rt-guide' });
  ok('guides admin: edit persisted reviewed_by + updated_at', gDoc2?.reviewed_by === 'Second Reviewer' && !!gDoc2.updated_at && !!gDoc2.created_at);
  const gPage = await http('GET', '/guides/rt-guide');
  ok('guide page: reviewed_by shown after edit', /Last reviewed by Second Reviewer/.test(gPage.text));
  ok('guide page: reading time', /\d+ min read/.test(gPage.text));
  ok('guide page: updated date', /Updated\s*(<!-- -->)?\s*<time/.test(gPage.text) || /Updated <time/.test(gPage.text) || /· Updated/.test(gPage.text));
  ok('guide page: table of contents', /On this page/.test(gPage.text) && /Section Two/.test(gPage.text));
  ok('guide page: JSON-LD present', /application\/ld\+json/.test(gPage.text));
  ok('guides admin: unauthorized PUT 401', (await http('PUT', '/api/admin-guides/rt-guide', { json: {} })).status === 401);

  // ============================================================ (4) event votes
  section('4. Event vote forms (window enforcement + upsert + unique index)');
  const vote = (cookie, v = 'legion_time', power = '12,345,678') => http('POST', '/api/event-participation', { cookie, json: { form: 'swordland-showdown', vote: v, power } });
  ok('vote: anon POST 401', (await http('POST', '/api/event-participation', { json: { form: 'swordland-showdown', vote: 'absent', power: 1 } })).status === 401);
  ok('gates: non-admin PATCH 401', (await http('PATCH', '/api/admin-form-gates', { cookie: c1, json: { form_key: 'swordland', is_open: true } })).status === 401);
  ok('gates: invalid window (close before open) 400', (await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'swordland', is_open: true, opens_at: future(2), closes_at: future(1) } })).status === 400);
  const gBefore = await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'swordland', is_open: true, opens_at: future(1), closes_at: future(3), cycle_id: 'c1' } });
  ok('gates: admin sets future window', gBefore.status === 200 && gBefore.body.gate?.cycle_id === 'c1', JSON.stringify(gBefore.body));
  const gateDoc = await C('form_gates').findOne({ form_key: 'swordland' });
  ok('gates: window stored as Dates in Mongo', gateDoc?.opens_at instanceof Date && gateDoc?.closes_at instanceof Date && gateDoc.cycle_id === 'c1');
  const before = await vote(c1);
  ok('vote: before open rejected (403)', before.status === 403, `${before.status} ${JSON.stringify(before.body)}`);
  ok('vote: nothing stored before open', (await C('event_participation').countDocuments({ member_id: M1 })) === 0);
  const getBefore = await http('GET', '/api/event-participation?form=swordland-showdown', { cookie: c1 });
  ok('vote: GET reports window not open', getBefore.status === 200 && getBefore.body.window?.state === 'upcoming', JSON.stringify(getBefore.body.window));
  await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'swordland', is_open: true, opens_at: future(-1), closes_at: future(2) } });
  ok('vote: invalid vote value 400', (await vote(c1, 'maybe')).status === 400);
  ok('vote: invalid power 400', (await vote(c1, 'flexible', 'lots')).status === 400);
  const v1 = await vote(c1, 'legion_time', '12,345,678');
  ok('vote: during window saved (200)', v1.status === 200, JSON.stringify(v1.body));
  const v2 = await vote(c1, 'absent', 5000);
  ok('vote: second save during window 200', v2.status === 200);
  const rows1 = await C('event_participation').find({ member_id: M1, form_id: 'swordland-showdown' }).toArray();
  ok('vote: upsert -> exactly one doc for member', rows1.length === 1, `found ${rows1.length}`);
  ok('vote: doc has latest vote/power/cycle and created_at < = updated_at', rows1[0]?.vote === 'absent' && rows1[0]?.power === 5000 && rows1[0]?.cycle_id === 'c1' && rows1[0].created_at <= rows1[0].updated_at);
  ok('vote: second member does not collide', (await vote(c2, 'flexible', 777)).status === 200 && (await C('event_participation').countDocuments({ form_id: 'swordland-showdown' })) === 2);
  ok('vote: m1 doc unaffected by m2', (await C('event_participation').findOne({ member_id: M1, form_id: 'swordland-showdown' })).vote === 'absent');
  const idx = await C('event_participation').indexes();
  ok('vote: unique index member_form_cycle_unique exists', idx.some((i) => i.name === 'member_form_cycle_unique' && i.unique));
  ok('vote: raw duplicate insert -> E11000', await rawInsertExpectDup(C('event_participation'), { member_id: M1, form_id: 'swordland-showdown', cycle_id: 'c1', vote: 'flexible', power: 1 }));
  ok('vote: other forms (tri-alliance) are independent for same member', (await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'tri-alliance', is_open: true, opens_at: future(-1), closes_at: future(2) } })).status === 200
    && (await http('POST', '/api/event-participation', { cookie: c1, json: { form: 'tri-alliance-clash', vote: 'flexible', power: 1 } })).status === 200
    && (await C('event_participation').countDocuments({ member_id: M1 })) === 2);
  const getDuring = await http('GET', '/api/event-participation?form=swordland-showdown', { cookie: c1 });
  ok('vote: GET shows window open + my entry', getDuring.body?.window?.state === 'open' && getDuring.body?.entry?.vote === 'absent');
  // new cycle -> a fresh doc is allowed for the same member
  await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'swordland', is_open: true, cycle_id: 'c2' } });
  ok('vote: new cycle accepts a new entry (two docs total for m1 swordland)', (await vote(c1, 'flexible', 1)).status === 200 && (await C('event_participation').countDocuments({ member_id: M1, form_id: 'swordland-showdown' })) === 2);
  await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'swordland', is_open: true, opens_at: future(-3), closes_at: future(-1) } });
  const after = await vote(c1, 'legion_time', 42);
  ok('vote: after close rejected (403)', after.status === 403, `${after.status} ${JSON.stringify(after.body)}`);
  ok('vote: after-close attempt did not change stored vote', (await C('event_participation').findOne({ member_id: M1, form_id: 'swordland-showdown', cycle_id: 'c2' })).vote === 'flexible');
  ok('vote: GET reports closed', (await http('GET', '/api/event-participation?form=swordland-showdown', { cookie: c1 })).body?.window?.state === 'closed');
  // reopen for UI checks later
  await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'swordland', is_open: true, opens_at: future(-1), closes_at: future(24) } });

  // ============================================================ member-form-status + deadlines
  section('3a. member-form-status + deadlines');
  ok('form-status: anon returns signedIn=false', (await http('GET', '/api/member-form-status')).body?.signedIn === false);
  const fs1 = await http('GET', '/api/member-form-status', { cookie: c1 });
  ok('form-status: member 200, signedIn, forms + entries arrays', fs1.status === 200 && fs1.body.signedIn === true && Array.isArray(fs1.body.forms) && fs1.body.forms.length > 0 && Array.isArray(fs1.body.entries) && !fs1.body.degraded, JSON.stringify(fs1.body).slice(0, 300));
  const f1 = (k) => fs1.body.forms.find((f) => f.key === k);
  ok('form-status: lead (Power Profile) reads as done for m1', !!f1('lead') && /done|complete|submitted|updated/i.test(JSON.stringify(f1('lead'))), JSON.stringify(f1('lead')));
  ok('form-status: swordland has an entry for m1', !!f1('swordland') && !!(f1('swordland').updatedAt || f1('swordland').lastUpdated || f1('swordland').submittedAt || /done|complete|submitted|updated/i.test(JSON.stringify(f1('swordland')))), JSON.stringify(f1('swordland')));
  const fs3 = await http('GET', '/api/member-form-status', { cookie: c3 });
  ok('form-status: fresh member has outstanding items', fs3.body?.summary && fs3.body.firstIncomplete, JSON.stringify(fs3.body?.firstIncomplete));
  const dl = await http('GET', '/api/deadlines');
  ok('deadlines: public 200 with items', dl.status === 200 && Array.isArray(dl.body.items) && dl.body.items.length > 0, JSON.stringify(dl.body).slice(0, 200));

  // ============================================================ (5) KvK appointments
  section('5. KvK appointments');
  await http('PATCH', '/api/admin-form-gates', { cookie: adminCookie, json: { form_key: 'appointments', is_open: true } });
  const apply = (cookie, over = {}) => http('POST', '/api/kvk-appointments', {
    cookie, json: { day: 1, buff: 'construction', tg: 100, ttg: 10, speedup_days: 5, preferred_hours: ['02:00', '03:00', '04:00'], in_game_name: 'N', ...over },
  });
  ok('appts: anon POST 401', (await http('POST', '/api/kvk-appointments', { json: {} })).status === 401);
  ok('appts: 2 hours rejected 400', (await apply(c1, { preferred_hours: ['02:00', '03:00'] })).status === 400);
  ok('appts: 4 hours rejected 400', (await apply(c1, { preferred_hours: ['02:00', '03:00', '04:00', '05:00'] })).status === 400);
  ok('appts: duplicate hours rejected 400', (await apply(c1, { preferred_hours: ['02:00', '02:00', '03:00'] })).status === 400);
  ok('appts: invalid hour rejected 400', (await apply(c1, { preferred_hours: ['02:30', '03:00', '04:00'] })).status === 400);
  ok('appts: invalid buff rejected 400', (await apply(c1, { buff: 'nope' })).status === 400);
  ok('appts: exactly 3 hours accepted', (await apply(c1, { in_game_name: 'Alpha' })).status === 200);
  ok('appts: re-apply upserts (200, one doc, new value)', (await apply(c1, { tg: 5000, in_game_name: 'Alpha' })).status === 200
    && (await C('kvk_appointment_applications').countDocuments({ member_id: M1, day: 1, buff: 'construction' })) === 1
    && (await C('kvk_appointment_applications').findOne({ member_id: M1, day: 1, buff: 'construction' })).tg === 5000);
  // more applicants: m2 (tie with later created), plus synthetic members rt-a1..rt-a5 through the API
  const extra = [];
  for (let i = 1; i <= 5; i++) {
    const id = `rt-a${i}`; extra.push(id);
    const r = await apply(memberCookieHeader(id), { tg: 100 * i, ttg: 0, speedup_days: 0, in_game_name: `Applicant${i}`, preferred_hours: ['02:00', '03:00', '04:00'] });
    if (r.status !== 200) ok(`appts: seed applicant ${id}`, false, JSON.stringify(r.body));
  }
  // two with identical score -> tie-breaker (created_at then member id)
  await apply(c2, { tg: 5000, ttg: 0, speedup_days: 0, in_game_name: 'Beta', preferred_hours: ['02:00', '03:00', '04:00'] });
  await C('kvk_appointment_applications').updateOne({ member_id: M1, day: 1, buff: 'construction' }, { $set: { ttg: 0, speedup_days: 0 } });
  // a different type for m1
  ok('appts: apply for a second type (day 4 training)', (await apply(c1, { day: 4, buff: 'training', preferred_hours: ['10:00', '11:00', '12:00'] })).status === 200);
  const apps = await C('kvk_appointment_applications').find({ day: 1, buff: 'construction' }).toArray();
  ok('appts: 7 construction applications in Mongo (one per member)', apps.length === 7 && new Set(apps.map((a) => a.member_id)).size === 7, `found ${apps.length}`);

  ok('appts: member cannot use admin allocate (401)', (await http('POST', '/api/admin-kvk-appointments', { cookie: c1, json: { action: 'auto_allocate' } })).status === 401);
  const alloc1 = await http('POST', '/api/admin-kvk-appointments', { cookie: adminCookie, json: { action: 'auto_allocate' } });
  ok('appts: admin auto-allocate 200', alloc1.status === 200, JSON.stringify(alloc1.body));
  const readAsg = async () => (await C('kvk_appointment_assignments').find({}).toArray());
  const asg1 = await readAsg();
  const mapOf = (rows) => Object.fromEntries(rows.map((r) => [`${r.day}:${r.buff}:${r.member_id}`, r.slot]));
  const cons = asg1.filter((a) => a.day === 1 && a.buff === 'construction');
  ok('appts: all 7 construction applicants + 1 training assigned', cons.length === 7 && asg1.length === 8, `cons=${cons.length} total=${asg1.length}`);
  ok('appts: no double booking (unique slot per type)', new Set(cons.map((a) => a.slot)).size === cons.length);
  ok('appts: one slot per member', new Set(cons.map((a) => a.member_id)).size === cons.length);
  const prefOf = Object.fromEntries(apps.map((a) => [a.member_id, a.preferred_hours]));
  ok('appts: every slot is inside one of the member\'s preferred hours', cons.every((a) => prefOf[a.member_id].includes(hourOf(a.slot))));
  const { allocateSlots } = await import('../lib/kvkAppointments.mjs');
  const expected = allocateSlots(apps, []).assignments;
  ok('appts: DB result equals pure allocator output', expected.length === cons.length && expected.every((e) => cons.find((c) => c.member_id === e.member_id)?.slot === e.slot));
  const top = [...cons].sort((a, b) => b.score - a.score)[0];
  ok('appts: highest score gets the earliest slot', cons.every((a) => top.slot <= a.slot), `top=${top.member_id}@${top.slot}`);
  const alloc2 = await http('POST', '/api/admin-kvk-appointments', { cookie: adminCookie, json: { action: 'auto_allocate' } });
  const asg2 = await readAsg();
  ok('appts: re-run allocation is deterministic (identical map)', alloc2.status === 200 && JSON.stringify(Object.entries(mapOf(asg2)).sort()) === JSON.stringify(Object.entries(mapOf(asg1)).sort()));
  ok('appts: re-run did not duplicate rows', asg2.length === asg1.length);
  // unique indexes
  const aIdx = await C('kvk_appointment_assignments').indexes();
  ok('appts: assignment unique indexes exist', ['cycle_day_buff_slot_unique', 'cycle_day_buff_member_unique'].every((n) => aIdx.some((i) => i.name === n && i.unique)));
  const sample = cons[0];
  ok('appts: raw duplicate slot -> E11000', await rawInsertExpectDup(C('kvk_appointment_assignments'), { cycle_id: 'current', day: 1, buff: 'construction', slot: sample.slot, member_id: 'rt-zzz', name: 'z' }));
  ok('appts: raw duplicate member -> E11000', await rawInsertExpectDup(C('kvk_appointment_assignments'), { cycle_id: 'current', day: 1, buff: 'construction', slot: '23:30', member_id: sample.member_id, name: 'z' }));
  ok('appts: raw duplicate application -> E11000', await rawInsertExpectDup(C('kvk_appointment_applications'), { member_id: M1, day: 1, buff: 'construction', cycle_id: 'current', tg: 1 }));
  const manualConflict = await http('POST', '/api/admin-kvk-appointments', { cookie: adminCookie, json: { action: 'assign', day: 1, buff: 'construction', member_id: M2, slot: cons.find((c) => c.member_id !== M2).slot } });
  ok('appts: manual assign to a taken slot -> 409', manualConflict.status === 409, JSON.stringify(manualConflict.body));
  ok('appts: manual assign for non-applicant -> 404', (await http('POST', '/api/admin-kvk-appointments', { cookie: adminCookie, json: { action: 'assign', day: 1, buff: 'construction', member_id: 'rt-nobody', slot: '20:00' } })).status === 404);

  // unpublished hidden
  const schedHidden = await http('GET', '/api/kvk-appointments/schedule', { cookie: c1 });
  ok('appts: unpublished schedule hidden from members', schedHidden.status === 200 && schedHidden.body.published === false && schedHidden.body.days.length === 0);
  const mineHidden = await http('GET', '/api/kvk-appointments', { cookie: c1 });
  ok('appts: unpublished -> member sees applications but no assignments', mineHidden.body.published === false && mineHidden.body.assignments.length === 0 && mineHidden.body.applications.length === 2);
  ok('appts: schedule anon 401', (await http('GET', '/api/kvk-appointments/schedule')).status === 401);
  const adminGet = await http('GET', '/api/admin-kvk-appointments', { cookie: adminCookie });
  ok('appts: admin GET lists apps ranked and assignments', adminGet.status === 200 && adminGet.body.applications.length === 8 && adminGet.body.assignments.length === 8 && adminGet.body.published === false);
  const pageHidden = await http('GET', '/forms/kvk-appointments?tab=schedule', { cookie: c1 });
  ok('appts: schedule page does not leak names before publish', pageHidden.status === 200 && !/Applicant3|Alpha/.test(pageHidden.text));
  const pub = await http('POST', '/api/admin-kvk-appointments', { cookie: adminCookie, json: { action: 'publish', published: true } });
  ok('appts: admin publish 200', pub.status === 200 && pub.body.published === true);
  ok('appts: cycle published flag in Mongo', (await C('kvk_appointment_cycles').findOne({ cycle_id: 'current' }))?.published === true);
  const mineNow = await http('GET', '/api/kvk-appointments', { cookie: c1 });
  ok('appts: published -> member sees own assignments (2 types)', mineNow.body.published === true && mineNow.body.assignments.length === 2);
  const m1Slot = cons.find((c) => c.member_id === M1).slot;
  ok('appts: member assignment slot matches Mongo', mineNow.body.assignments.some((a) => a.day === 1 && a.slot === m1Slot));
  const schedNow = await http('GET', '/api/kvk-appointments/schedule', { cookie: c2 });
  ok('appts: published schedule lists names, no member ids', schedNow.body.published === true && /Alpha/.test(JSON.stringify(schedNow.body)) && !/rt-m1|rt-a1/.test(JSON.stringify(schedNow.body)));
  ok('appts: schedule flags only viewer\'s own slot as mine', schedNow.body.days.flatMap((d) => d.slots).filter((s) => s.mine).length === 1);

  // ============================================================ (7) interest
  section('7. Interest form');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const interestForm = (over = {}, files = 1) => {
    const f = new FormData();
    const fields = {
      in_game_name: 'RT Applicant', player_id: '12345678', discord_username: 'rt#0001', current_server: '123', current_alliance: 'ABC', migrate_alliance: '710',
      highest_troop_level: 'T10', current_tg: '5', mystic_trial_stages: '40', total_power: '12,000,000', willing_reduce_power: 'yes', passes_required: '1', current_passes: '2',
      active_commit: 'yes', willing_save_resources: 'yes', participates_battles: 'yes', spending_archetype: 'Dolphin', main_language: 'English', ...over,
    };
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    f.append('t11_units', 'Infantry');
    for (let i = 0; i < files; i++) f.append('screenshots', new Blob([png], { type: 'image/png' }), `shot${i}.png`);
    return f;
  };
  ok('interest: closed intake -> 409', (await http('POST', '/api/interest', { form: interestForm() })).status === 409);
  const period = await http('POST', '/api/admin-intake-periods', { cookie: adminCookie, json: { label: 'RT Intake', activate: true } });
  ok('interest: admin creates + activates intake period', period.status === 200 && period.body.period?.is_active === true, JSON.stringify(period.body));
  ok('interest: no screenshots -> 400', (await http('POST', '/api/interest', { form: interestForm({}, 0) })).status === 400);
  ok('interest: missing required field -> 400', (await http('POST', '/api/interest', { form: interestForm({ player_id: '' }) })).status === 400);
  const good = await http('POST', '/api/interest', { form: interestForm() });
  ok('interest: valid minimal payload -> 200 + reference', good.status === 200 && /^K710-[0-9A-F]{8}$/.test(good.body?.reference || ''), `${good.status} ${JSON.stringify(good.body)}`);
  const idoc = await C('interest_submissions').findOne({ in_game_name: 'RT Applicant' });
  ok('interest: stored in Mongo (pending, intake label, 1 screenshot data URL, 11-field)', !!idoc && idoc.status === 'pending' && idoc.intake_period === 'RT Intake' && idoc.screenshot_urls.length === 1 && /^data:image\/png;base64,/.test(idoc.screenshot_urls[0]) && idoc.t11_units[0] === 'Infantry');
  const adminList = await http('GET', '/api/admin-interest-submissions', { cookie: adminCookie });
  ok('interest: admin list shows it', adminList.status === 200 && JSON.stringify(adminList.body).includes('RT Applicant'));
  ok('interest: admin list requires admin', (await http('GET', '/api/admin-interest-submissions')).status === 401);

  // ============================================================ (8) alliances admin
  section('8. Alliances admin edit -> public page');
  const setA = await http('PUT', '/api/admin-alliances/710', { cookie: adminCookie, json: { timezone_focus: 'UTC+2 (Europe)', roster_size: 87, language: 'German', blurb: 'Real-db blurb marker' } });
  ok('alliances: admin PUT 200', setA.status === 200 && setA.body.alliance.roster_size === 87, JSON.stringify(setA.body));
  ok('alliances: bad recruiting status 400', (await http('PUT', '/api/admin-alliances/710', { cookie: adminCookie, json: { recruiting_status: 'weird' } })).status === 400);
  ok('alliances: non-admin PUT 401', (await http('PUT', '/api/admin-alliances/710', { cookie: c1, json: { name: 'x' } })).status === 401);
  ok('alliances: unknown tag 404', (await http('PUT', '/api/admin-alliances/NOPE', { cookie: adminCookie, json: { name: 'x' } })).status === 404);
  const p1 = await http('GET', '/alliances/710');
  ok('alliance page: shows timezone, roster, language', p1.status === 200 && /UTC\+2/.test(p1.text) && /87 members/.test(p1.text) && /German/.test(p1.text), `status ${p1.status}`);
  ok('alliance page: blurb marker', /Real-db blurb marker/.test(p1.text));
  ok('alliance page: bear times 01:00 / 13:00', /01:00/.test(p1.text) && /13:00/.test(p1.text));
  await http('PUT', '/api/admin-alliances/710', { cookie: adminCookie, json: { timezone_focus: '', roster_size: '', language: '' } });
  const p2 = await http('GET', '/alliances/710');
  ok('alliance page: empty facts are hidden', p2.status === 200 && !/UTC\+2/.test(p2.text) && !/87 members/.test(p2.text) && !/German/.test(p2.text) && !/Timezone focus/.test(p2.text) && !/Roster size/.test(p2.text), 'labels still present');
  const aDoc = await C('alliances').findOne({ tag: '710' });
  ok('alliances: Mongo doc cleared (null values)', aDoc.timezone_focus === null && aDoc.roster_size === null && aDoc.language === null);
  await http('PUT', '/api/admin-alliances/710', { cookie: adminCookie, json: { timezone_focus: 'UTC', language: 'English', roster_size: 90 } });

  // ============================================================ (3) rendered pages (browser)
  section('3b. Rendered pages (visitor + member, console errors, axe)');
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined), args: ['--no-sandbox'] });
  async function newCtx(memberId, vw = 1440, vh = 900) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('k710-forge-seen', '1'); localStorage.setItem('k710-language-v1', 'en'); } catch { /* ignore */ } });
    if (memberId) await ctx.addCookies([{ name: 'k710_member_session', value: memberToken(memberId), url: B }]);
    return ctx;
  }
  async function visit(ctx, path, { axe = false, label = '' } = {}) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const res = await page.goto(B + path, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => 0, err: e }));
    const status = res.status();
    const h1 = await page.locator('h1').count();
    const text = await page.locator('body').innerText().catch(() => '');
    let axeContrast = 0;
    let axeOther = [];
    if (axe && status === 200) {
      await page.evaluate(AXE_SRC);
      const v = await page.evaluate(async () => (await axe.run({ resultTypes: ['violations'] })).violations.map((x) => ({ id: x.id, n: x.nodes.length })));
      axeContrast = v.filter((x) => x.id === 'color-contrast').reduce((s, x) => s + x.n, 0);
      axeOther = v.filter((x) => x.id !== 'color-contrast');
    }
    const tag = `${label || 'page'} ${path}`;
    ok(`${tag}: 200`, status === 200, `status ${status}`);
    ok(`${tag}: one h1`, h1 === 1, `h1=${h1}`);
    ok(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    if (axe) {
      ok(`${tag}: axe strict (no color-contrast violations)`, axeContrast === 0, `${axeContrast} nodes`);
      if (axeOther.length) console.log(`INFO  ${tag}: other axe violations: ${axeOther.map((x) => `${x.id}(${x.n})`).join(', ')}`);
    }
    return { page, text, status, errors };
  }

  const vctx = await newCtx(null);
  for (const [path, axe, expectText] of [
    ['/', true, /Kingdom 710|K710/i],
    ['/about', true],
    ['/alliances/710', true, /710/],
    ['/alliances/red', false, /RED/i],
    ['/alliances/sky', false, /SKY/i],
    ['/events', true, /RT Test Event/],
    ['/events/rt-event', false, /RT Test Event/],
    ['/events/kvk-cycle', false, /KvK cycle/i],
    ['/guides', true, /RT Test Guide/],
    ['/guides/rt-guide', true, /RT Test Guide/],
  ]) {
    const r = await visit(vctx, path, { axe, label: 'visitor' });
    if (expectText) ok(`visitor ${path}: expected content present`, expectText.test(r.text));
    if (path === '/events') ok('visitor /events: draft event not listed', !/RT Draft Event/.test(r.text));
    if (path === '/guides') ok('visitor /guides: draft guide hidden', !/RT Draft Guide/.test(r.text));
    if (path === '/guides/rt-guide') {
      ok('visitor guide: reading time + reviewed_by + updated + TOC visible', /\d+ min read/.test(r.text) && /Last reviewed by Second Reviewer/.test(r.text) && /Updated/.test(r.text) && /On this page/.test(r.text));
    }
    if (path === '/') ok('visitor /: no "Welcome back"', !/Welcome back/.test(r.text));
    await r.page.close();
  }
  ok('events: draft event page is 404', (await http('GET', '/events/rt-draft-event')).status === 404);
  ok('guides: draft guide page is 404 for visitors', (await http('GET', '/guides/rt-draft-guide')).status === 404);
  const memGuideVisitor = await http('GET', '/guides/rt-members-guide');
  ok('guides: members-only guide does not leak body to visitor', !/Members only body/.test(memGuideVisitor.text));
  const memGuideMember = await http('GET', '/guides/rt-members-guide', { cookie: c1 });
  ok('guides: members-only guide readable by member', memGuideMember.status === 200 && /Members only body/.test(memGuideMember.text));
  await vctx.close();

  const mctx = await newCtx(M3);
  const home = await visit(mctx, '/', { axe: true, label: 'member' });
  ok('member /: "Welcome back, RealTester"', /Welcome back, RealTester/.test(home.text), home.text.slice(0, 200));
  ok('member /: Next Bear Hunt countdown (710)', /Next Bear Hunt/i.test(home.text));
  ok('member /: outstanding forms listed', /Power Profile/.test(home.text) && /KvK Forms/.test(home.text) && /Flamedragon Tyrant Forms/.test(home.text));
  await home.page.close();
  const dash = await visit(mctx, '/dashboard', { axe: true, label: 'member' });
  await dash.page.waitForSelector('#needs-input-title', { timeout: 8000 }).catch(() => {});
  const dashText = await dash.page.locator('body').innerText();
  ok('member /dashboard: "Needs your input" card rendered from form-status + deadlines', /Needs your input/.test(dashText), dashText.slice(0, 200));
  await dash.page.close();
  for (const path of ['/forms', '/forms/swordland-showdown', '/forms/kvk-appointments?tab=apply', '/tools', '/events', '/guides', '/about']) {
    const r = await visit(mctx, path, { label: 'member' });
    await r.page.close();
  }
  await mctx.close();

  // member 1: appointments UI after publish, vote form, power profile
  const m1ctx = await newCtx(M1);
  const mine = await visit(m1ctx, '/forms/kvk-appointments?tab=mine', { label: 'm1' });
  await mine.page.waitForFunction(() => /Assigned/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const mineText = await mine.page.locator('body').innerText();
  const [sh, sm] = m1Slot.split(':').map(Number);
  const endMin = sh * 60 + sm + 30;
  const range = `${m1Slot}–${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  ok('My Appointments tab shows assignment (status word + UTC range)', /Assigned/.test(mineText) && mineText.includes(range), `expected ${range} in: ${mineText.slice(0, 400)}`);
  await mine.page.close();
  const sched = await visit(m1ctx, '/forms/kvk-appointments?tab=schedule', { label: 'm1' });
  await sched.page.waitForFunction(() => /Applicant3/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const schedText = await sched.page.locator('body').innerText();
  ok('Schedule tab shows assigned names', /Applicant3/.test(schedText) && /Alpha/.test(schedText), schedText.slice(0, 300));
  await sched.page.close();
  const vf = await visit(m1ctx, '/forms/swordland-showdown', { label: 'm1' });
  await vf.page.waitForTimeout(800);
  const vfText = await vf.page.locator('body').innerText();
  ok('vote form page: shows prior entry notice (upsert)', /Last updated|Saving replaces/i.test(vfText), vfText.slice(0, 300));
  await vf.page.close();
  const pp = await visit(m1ctx, '/power-profile', { label: 'm1' });
  await pp.page.close();
  await m1ctx.close();
  await browser.close();

  // ---- final DB sanity: no duplicate groups anywhere the unique indexes protect
  section('DB sanity');
  const dupGroups = await C('event_participation').aggregate([{ $group: { _id: { m: '$member_id', f: '$form_id', c: '$cycle_id' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  ok('no duplicate (member, form, cycle) groups in event_participation', dupGroups.length === 0);
  const dupPP = await C('power_profiles').aggregate([{ $group: { _id: '$member_id', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  ok('no duplicate member_id in power_profiles', dupPP.length === 0);

  await mongo.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log(`Failed checks:\n - ${failures.join('\n - ')}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('integration suite crashed:', e); process.exit(2); });
