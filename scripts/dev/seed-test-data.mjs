#!/usr/bin/env node
/**
 * QA seed: realistic Kingdom 710 test data created through the REAL HTTP APIs.
 *
 *   node scripts/dev/seed-test-data.mjs            # against http://localhost:3000
 *   QA_BASE=http://localhost:3001 node ...         # other port
 *
 * Needs the dev server running and .env.local (ADMIN_PASSWORD, MEMBER_SESSION_SECRET).
 * Idempotent: re-running upserts/skips what exists. Everything is marked:
 *   - member ids 920000001-920000030, names "Test Aria", "Test Bjorn", ...
 *   - guides/events slugs start with "qa-test-", gift codes "QATEST...", gallery titles "QA Test ..."
 *   - a final tagging pass sets `is_test: true` on every row where the schema allows it
 * REMOVE everything with:  node scripts/dev/clear-test-data.mjs
 *
 * Members 1-25 are accepted transfers (that is how a roster/kingshot_users row is created),
 * 26 = rejected, 27 = waitlist, 28-30 stay pending (Inbox testing).
 * Admin cycle operations: ensures current KvK cycle "KvK Season 1" and Flamedragon "Flamedragon Season 1".
 */
import { BASE, MEMBER_IDS, nameOf, idOf, loadEnv, memberCookie, adminLogin, client, makePng, mongo } from './qa-lib.mjs';

const env = loadEnv();
const counts = {};
const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
const problems = [];
const must = (label, r, ok = [200, 201]) => {
  if (!ok.includes(r.status)) { problems.push(`${label}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return false; }
  bump(label); return true;
};

const ALLIANCE_OF = (i) => (i % 3 === 0 ? '710' : i % 3 === 1 ? 'RED' : 'SKY');
const HEROES = ['Chenko', 'Yeonwoo', 'Amane', 'Amadeus', 'Vivian', 'Margot', 'Thrud', 'Saul'];
const TIER = ['T11', 'T10'];
const TG = ['TG8', 'TG7', 'TG6', 'TG5', 'Below TG5'];
const AVAIL_KVK = ['First half (12-14:30 UTC)', 'Second half (14:30-17 UTC)', 'Full battle (12-17 UTC)', 'Not Available'];
const AVAIL_FD = ['12-18 UTC (Full Battle)', 'Unavailable', '12-15 UTC (First Half)', '15-18 UTC (Second Half)', 'Intermittent'];

const adminCookie = await adminLogin(env);
const admin = client(adminCookie);
console.log('admin logged in');

/* ---------- 1. public content via admin APIs ---------- */
{
  const r = await admin('GET', '/api/admin-alliances');
  const have = new Set((r.json.alliances || []).map((a) => a.tag));
  const defs = [
    ['710', 'Legend Of Zenzen', 'open'], ['RED', 'Red Phoenix', 'selective'], ['SKY', 'Sky Wardens', 'closed'],
  ];
  for (const [tag, name, st] of defs) {
    const body = {
      tag, name, recruiting_status: st, blurb: `[QA test] ${name} - friendly war alliance for Kingdom 710.`, roster_size: 80, language: 'English',
      timezone_focus: 'EU / NA', sort_order: tag === '710' ? 1 : tag === 'RED' ? 2 : 3,
      bear_times_utc: ['13:00', '22:00'],
      scheduled_events: [
        { type: 'regular_swordland_1', date: '2026-10-18', time_utc: '12:00' },
        { type: 'tri_alliance_1', date: '2026-10-25', time_utc: '14:00' },
        { type: 'vikings_vengeance', date: '2026-11-02', time_utc: '19:00' },
      ],
    };
    if (have.has(tag)) must('alliance-updated', await admin('PUT', `/api/admin-alliances/${tag}`, body));
    else must('alliance-created', await admin('POST', '/api/admin-alliances', body));
  }
  // second pass of alliance events through the dedicated shape (also exercises PUT validation)
}
{
  const r = await admin('GET', '/api/admin-events');
  const have = new Set((r.json.events || []).map((e) => e.slug));
  const day = 864e5; const now = Date.now();
  const evs = [
    ['qa-test-kvk-season-1', 'KvK Season 1 kickoff', 'kvk', now + 5 * day, 'none'],
    ['qa-test-swordland-weekly', 'Swordland Showdown (weekly)', 'swordland', now + 2 * day, 'weekly'],
    ['qa-test-championship', 'Kingdom Championship', 'championship', now + 12 * day, 'none'],
    ['qa-test-community-night', 'Community movie night', 'custom', now + 3 * day, 'monthly'],
    ['qa-test-draft-event', 'Unpublished planning draft', 'custom', now + 20 * day, 'none'],
  ];
  for (const [slug, title, kind, at, freq] of evs) {
    if (have.has(slug)) { bump('event-existing'); continue; }
    must('event-created', await admin('POST', '/api/admin-events', {
      slug, title, kind, starts_at: new Date(at).toISOString(), ends_at: new Date(at + 3 * 36e5).toISOString(),
      description: `[QA test] ${title}`, body_md: `## ${title}\n\nBring your best troops. Times are UTC.`,
      recurrence_frequency: freq, recurrence_interval: 1, published: slug !== 'qa-test-draft-event',
    }));
  }
}
{
  for (const name of ['Getting started', 'Battle basics', 'Economy']) await admin('POST', '/api/admin-guide-categories', { name });
  const r = await admin('GET', '/api/admin-guides');
  const have = new Set((r.json.guides || []).map((g) => g.slug));
  const gs = [
    ['qa-test-new-player-guide', 'Test: New player guide', 'Getting started', 'public', true],
    ['qa-test-rally-basics', 'Test: Rally basics', 'Battle basics', 'public', true],
    ['qa-test-members-economy', 'Test: Economy for members', 'Economy', 'members', true],
    ['qa-test-draft-guide', 'Test: Draft guide', 'Economy', 'public', false],
  ];
  gs.forEach(async () => {});
  let pos = 1;
  for (const [slug, title, category, access, pub] of gs) {
    if (have.has(slug)) { bump('guide-existing'); continue; }
    must('guide-created', await admin('POST', '/api/admin-guides', {
      slug, title, category, description: `[QA test] ${title}`, position: pos++, is_published: pub, access_level: access,
      body: `# ${title}\n\nStep one: log in with your in-game code.\n\n- Check the Forms page\n- Fill the Power Profile\n\n## Tips\nKeep your troops healed.`,
      f2p_content: slug.includes('economy') ? 'Free-to-play tips: save speedups.' : '', spender_content: slug.includes('economy') ? 'Spender tips: buy packs once per tier.' : '',
      reviewed_by: 'Test Aria',
    }), [200, 201]);
  }
}
for (const code of ['QATEST2026A', 'QATEST2026B', 'QATESTOLD01']) {
  must('gift-code', await admin('POST', '/api/admin-gift-codes', { action: 'add_code', code, source: 'qa-test', notes: '[QA test]' }));
}
await admin('POST', '/api/admin-gift-codes', { action: 'set_code_active', code: 'QATESTOLD01', active: false });
{
  const r = await admin('GET', '/api/admin-gallery');
  const have = new Set((r.json.images || []).map((g) => g.title));
  for (const [i, title] of ['QA Test Forge at dusk', 'QA Test Rally banner', 'QA Test Castle'].entries()) {
    if (have.has(title)) { bump('gallery-existing'); continue; }
    const fd = new FormData();
    fd.append('file', new Blob([makePng(320, 200, [60 + i * 50, 90, 140 - i * 30])], { type: 'image/png' }), `qa${i}.png`);
    fd.append('title', title); fd.append('caption', '[QA test] generated image'); fd.append('alt_text', `${title} (generated test image)`);
    fd.append('position', String(i)); fd.append('is_published', 'true');
    must('gallery-image', await admin('POST', '/api/admin-gallery', fd, { form: true }), [201]);
  }
}

/* ---------- 2. transfer intake -> roster ---------- */
{
  const r = await admin('GET', '/api/admin-intake-periods');
  const active = (r.json.periods || []).find((p) => p.is_active || p.active);
  if (!active) must('intake-period', await admin('POST', '/api/admin-intake-periods', { label: 'QA Test Intake 2026-10', activate: true }));
  else bump('intake-existing');
}
const existingInterest = new Map();
{
  const r = await admin('GET', '/api/admin-interest-submissions');
  for (const row of r.json.rows || r.json.submissions || []) existingInterest.set(String(row.player_id), row);
}
for (let i = 0; i < 30; i++) {
  const pid = idOf(i);
  let row = existingInterest.get(pid);
  if (!row) {
    const fd = new FormData();
    const f = {
      in_game_name: nameOf(i), player_id: pid, discord_username: `testuser${i + 1}`, current_server: String(400 + i), current_alliance: 'XYZ',
      migrate_alliance: ALLIANCE_OF(i), highest_troop_level: i % 4 === 0 ? 'T10' : 'T11', current_tg: String(4 + (i % 4)), mystic_trial_stages: String(60 + i),
      total_power: String(80000000 + i * 3500000), willing_reduce_power: 'Yes', passes_required: '2', current_passes: String(i % 3),
      active_commit: 'Yes - daily', willing_save_resources: 'Yes', participates_battles: 'Always', spending_archetype: i % 2 ? 'Light spender' : 'Free to play', main_language: 'English',
    };
    for (const [k, v] of Object.entries(f)) fd.append(k, v);
    fd.append('t11_units', 'Infantry'); if (i % 2) fd.append('t11_units', 'Cavalry');
    fd.append('screenshots', new Blob([makePng(48, 48, [20 + i * 5, 80, 120])], { type: 'image/png' }), `battle-${i}.png`);
    const res = await client(adminCookie, { 'x-forwarded-for': `10.77.0.${i + 1}` })('POST', '/api/interest', fd, { form: true });
    if (!must('interest-submitted', res)) continue;
    const list = await admin('GET', '/api/admin-interest-submissions');
    row = (list.json.rows || list.json.submissions || []).find((x) => String(x.player_id) === pid);
    if (!row) { problems.push('interest row not found after submit ' + pid); continue; }
  }
  const status = i < 25 ? (i % 5 === 0 ? 'special' : 'normal') : i === 25 ? 'reject' : i === 26 ? 'waitlist' : 'pending';
  if (row.status !== status) must('interest-status:' + status, await admin('POST', '/api/admin-interest-status', { id: row.id, status, note: status === 'reject' ? '[QA test] Power too low for now' : '[QA test] checked' }));
}

/* ---------- 3. cycles ---------- */
async function ensureCycle(type, label, windowDays = 14) {
  const st = await admin('GET', `/api/admin-event-control?type=${type}`);
  if (st.json?.cycle?.label === label) { bump(`cycle-${type}-existing`); return st.json.cycle.id; }
  const r = await admin('POST', '/api/admin-event-control', {
    type, action: 'start_cycle', label,
    start_date: new Date().toISOString().slice(0, 10), end_date: new Date(Date.now() + windowDays * 864e5).toISOString().slice(0, 10),
  });
  must(`cycle-${type}-started`, r);
  return r.json?.state?.cycle?.id;
}
const kvkCycle = await ensureCycle('kvk', 'KvK Season 1');
const fdCycle = await ensureCycle('flamedragon', 'Flamedragon Season 1');

// vote form windows (shut until scheduled); cycle ids are manual labels
const soon = new Date(Date.now() - 36e5).toISOString().slice(0, 16) + ':00Z';
const later = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 16) + ':00Z';
for (const key of ['swordland', 'tri-alliance', 'castle-battle']) {
  must('vote-window', await admin('PATCH', '/api/admin-form-gates', { form_key: key, is_open: true, message: '', opens_at: soon, closes_at: later, cycle_id: 'qa-s1' }));
}
must('requests-gate', await admin('PATCH', '/api/admin-form-gates', { form_key: 'requests', is_open: true, message: '' }));

/* ---------- 4. member journeys through the API ---------- */
const haveRequests = new Set(((await admin('GET', '/api/admin-website-requests')).json.rows || []).map((r) => r.member_id));
for (let i = 0; i < 25; i++) {
  const id = idOf(i); const name = nameOf(i);
  const m = client(memberCookie(id, env));

  // Power profile: full for i%3==0, partial otherwise, nearly empty for i%7==6
  const full = {
    name, member_id: id,
    governor_gear: 'Infantry 1: Purple T1 | Cavalry 1: Blue 3 stars | Archer 1: Purple 2 stars',
    charms: 'Infantry Charm 1: Level 12 | Cavalry Charm 1: Level 9 | Archer Charm 1: Level 14',
    hero_gear: 'Chenko: Gold 2 | Amane: Purple 3',
    pet_power: String(900000 + i * 41000), masters_power: String(1200000 + i * 77000), mystic_trial_score: String(40000 + i * 900),
    infantry_tier: TIER[i % 2], infantry_tg: TG[i % 4], cavalry_tier: TIER[(i + 1) % 2], cavalry_tg: TG[(i + 1) % 4], archer_tier: 'T11', archer_tg: TG[(i + 2) % 4],
    heroes: HEROES.slice(0, 3 + (i % 5)),
  };
  const profile = i % 7 === 6 ? { name, member_id: id } : i % 3 === 0 ? full : { name, member_id: id, pet_power: full.pet_power, infantry_tier: 'T10', infantry_tg: 'TG6', heroes: HEROES.slice(0, 2) };
  must('power-profile', await m('POST', '/api/power-profile', profile));

  // KvK availability (members 1-22; 23-25 intentionally skip so "Needs your input" has a case)
  if (i < 22) must('kvk-availability', await m('POST', '/api/kvk-availability', { name, member_id: id, current_alliance: ALLIANCE_OF(i), availability: AVAIL_KVK[i % 4] }));

  // Prep backpack (1-18)
  if (i < 18) must('prep-backpack', await m('POST', '/api/prep-backpack', {
    in_game_name: name, want_construction: i % 4 ? 'Yes' : 'No', construction_upgrades: ['Barracks', 'Academy'].slice(0, 1 + (i % 2)), ttg_used: String(120 + i * 10), tg_used: String(300 + i * 25),
    want_research: 'Yes', t11_troops: ['Infantry', 'Archer'].slice(0, 1 + (i % 2)), tg_dust: String(900 + i * 50), research_speedup_days: String(20 + i), want_troop_training: i % 3 ? 'Yes' : 'No',
    is_transfer: i % 5 === 0 ? 'Yes' : 'No', troop_speedup_days: String(15 + i), promoting_t11: i % 2 ? 'Yes' : 'No',
    avail_day1: ['12:00', '13:00'].slice(0, 1 + (i % 2)), avail_day2: ['14:00'], avail_day4: ['16:00', '17:00'], avail_day5: i % 4 === 0 ? ['18:00'] : [], notes: i % 5 === 0 ? 'Can only play after 20:00 UTC' : '',
  }));

  // Flamedragon (1-16)
  if (i < 16) must('flamedragon', await m('POST', '/api/flamedragon', {
    name, current_alliance: ALLIANCE_OF(i), infantry_tier: 'T11', infantry_tg: TG[i % 4], cavalry_tier: 'T10', cavalry_tg: TG[(i + 1) % 4], archer_tier: 'T11', archer_tg: TG[(i + 2) % 4],
    heroes: HEROES.slice(0, 4), charms: full.charms, governor_gear: full.governor_gear, pet_power: full.pet_power, masters_power: full.masters_power, mystic_trial_score: full.mystic_trial_score,
    availability: AVAIL_FD[i % 5], voice_chat: ['Yes', 'No', 'Will be in the call without speaking'][i % 3], auto_help: ['Yes', 'No', 'Can Purchase if needed'][i % 3],
  }));

  // Noble Advisor (1-10); want_troop_training No for some
  if (i < 10) {
    const yes = i % 3 !== 2;
    must('noble-advisor', await m('POST', '/api/noble-advisor', yes
      ? { in_game_name: name, want_troop_training: 'Yes', is_transfer: 'No', troop_speedup_days: String(10 + i), promoting_t11: 'Yes', avail_day4: ['02:15', '03:15', '14:45'] }
      : { in_game_name: name, want_troop_training: 'No', is_transfer: '', troop_speedup_days: '', promoting_t11: '', avail_day4: [] }));
  }

  // KvK appointments: all three day/buff types, contested hours 12-14
  const hoursSet = [['12:00', '13:00', '14:00'], ['13:00', '14:00', '15:00'], ['12:00', '18:00', '19:00'], ['03:00', '04:00', '05:00']];
  const types = [[1, 'construction', i < 20], [2, 'research', i < 15], [4, 'training', i < 12]];
  for (const [day, buff, on] of types) {
    if (!on) continue;
    must('appointment-application', await m('POST', '/api/kvk-appointments', {
      day, buff, in_game_name: name, tg: String(200 + i * 40 + day * 10), ttg: String(100 + i * 15), speedup_days: String(5 + i * 3.5), preferred_hours: hoursSet[(i + day) % 4],
    }));
  }

  // Vote forms
  const votes = ['legion_time', 'flexible', 'absent'];
  for (const [fi, slug] of ['swordland-showdown', 'tri-alliance-clash', 'castle-battle'].entries()) {
    if (i + fi * 3 < 24) must('event-vote:' + slug, await m('POST', '/api/event-participation', { form: slug, vote: votes[(i + fi) % 3], power: `${(88 + i) * 1000000 + fi * 12345}` }));
  }

  // Website requests (a few)
  if ([0, 4, 9, 13].includes(i) && !haveRequests.has(id)) {
    const sections = ['Tools and Calculators', 'Forms', 'Events', 'Guides', 'General'];
    must('website-request', await m('POST', '/api/website-requests', { current_alliance: ALLIANCE_OF(i), section: sections[i % 5], message: `[QA test] ${name} suggests: please add a dark-mode toggle and a bigger font for the ${sections[i % 5]} page.` }));
  }
}

/* ---------- 5. admin operations: rallies, appointments, tagging ---------- */
const subs = await admin('GET', '/api/admin-submissions');
const rosterIds = (subs.json.rows || subs.json.submissions || []).map((r) => String(r.member_id)).filter((x) => MEMBER_IDS.includes(x));
const mk = (n, ids, lead) => ({ id: `qa-rally-${n}`, name: `QA Rally ${n}`, memberIds: ids, leadMemberId: lead, troopWeights: {}, leadHeroes: [], leadHeroAssignments: {} });
if (rosterIds.length) {
  const chunks = [rosterIds.slice(0, 8), rosterIds.slice(8, 16), rosterIds.slice(16)];
  must('kvk-rallies-saved', await admin('PUT', '/api/admin-rallies', { rallies: chunks.map((c, n) => mk(n + 1, c, c[0])) }));
}
{
  const fd = await admin('GET', '/api/admin-flamedragon');
  const ids = (fd.json.rows || fd.json.submissions || []).map((r) => String(r.member_id)).filter((x) => MEMBER_IDS.includes(x));
  if (ids.length) must('flamedragon-rallies-saved', await admin('PUT', '/api/admin-flamedragon-rallies', { rallies: [mk(1, ids.slice(0, 8), ids[0]), mk(2, ids.slice(8), ids[8])] }));
}
{
  const r = await admin('POST', '/api/admin-kvk-appointments', { action: 'auto_allocate' });
  if (must('appointments-auto-allocate', r)) counts['appointments-summary'] = JSON.stringify(r.json.summary);
  must('appointments-published', await admin('POST', '/api/admin-event-control', { type: 'kvk', action: 'publish' }));
}

// tagging pass: is_test:true on every seeded row (direct Mongo, dev only)
try {
  const { client: mc, db } = await mongo();
  const byMember = { submissions: 'member_id', power_profiles: 'member_id', flamedragon_forms: 'member_id', prep_backpack: 'member_id', noble_advisor_submissions: 'member_id', kvk_appointment_applications: 'member_id', kvk_appointment_assignments: 'member_id', event_participation: 'member_id', website_requests: 'member_id', event_cycle_snapshots: 'member_id', kingshot_users: 'player_id', interest_submissions: 'player_id', kingshot_sessions: 'player_id' };
  for (const [coll, field] of Object.entries(byMember)) {
    const res = await db.collection(coll).updateMany({ [field]: { $in: MEMBER_IDS } }, { $set: { is_test: true } });
    counts[`tagged:${coll}`] = res.modifiedCount;
  }
  await db.collection('kingdom_guides').updateMany({ slug: /^qa-test-/ }, { $set: { is_test: true } });
  await db.collection('events').updateMany({ slug: /^qa-test-/ }, { $set: { is_test: true } });
  await db.collection('gift_codes').updateMany({ code: /^QATEST/ }, { $set: { is_test: true } });
  await db.collection('gallery_images').updateMany({ title: /^QA Test / }, { $set: { is_test: true } });
  await db.collection('alliances').updateMany({ blurb: /^\[QA test\]/ }, { $set: { is_test: true } });
  await db.collection('transfer_intake_periods').updateMany({ label: /^QA Test/ }, { $set: { is_test: true } });
  await mc.close();
} catch (e) { problems.push('tagging pass skipped: ' + e.message); }

console.log('\nCOUNTS'); console.table(counts);
console.log(`cycles: kvk=${kvkCycle} flamedragon=${fdCycle}`);
if (problems.length) { console.log('\nPROBLEMS (' + problems.length + ')'); problems.forEach((p) => console.log(' - ' + p)); }
