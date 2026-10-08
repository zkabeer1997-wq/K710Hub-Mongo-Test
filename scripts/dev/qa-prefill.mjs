// Dev-only Playwright regression: every member form is prefilled from the member's earlier answers
// after a NEW cycle starts, with the plain-language notice. Uses fresh member ids 930000001/2 and
// deletes their rows afterwards. Starts new KvK + Flamedragon cycles on the LOCAL test DB.
// Run: node scripts/dev/qa-prefill.mjs [phone|desktop] [easy]
import { execFileSync } from 'node:child_process';
import { client, adminLogin, BASE, loadEnv } from './qa-lib.mjs';
import { launch, newCtx, OUT } from './qa-browse.mjs';

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('local only');
const vp = process.argv[2] || 'phone';
const easy = process.argv[3] === 'easy';
const M1 = '930000001';
const M2 = '930000002';
const env = loadEnv();
const { memberCookie } = await import('./qa-lib.mjs');
const admin = client(await adminLogin(env));
const as = (id) => client(memberCookie(id, env));
const must = (label, r) => { if (r.status >= 400) throw new Error(`${label} failed ${r.status} ${JSON.stringify(r.json)}`); return r; };
const mongo = (js) => execFileSync('mongosh', ['--quiet', 'k710hub_test', '--eval', js], { encoding: 'utf8' });
const cleanup = () => mongo(`const ids=['${M1}','${M2}'];
for (const c of ['power_profiles','submissions','prep_backpack','flamedragon_forms','noble_advisor_submissions','kvk_appointment_applications','event_participation','website_requests'])
  db.getCollection(c).deleteMany({member_id:{$in:ids}});
db.event_cycle_snapshots.deleteMany({member_id:{$in:ids}});`);

const gates = (await admin('GET', '/api/admin-form-gates')).json;
const voteGate = (gates.gates || gates).find?.((g) => g.form_key === 'swordland');
const voteWindow = { opens_at: voteGate?.opens_at, closes_at: voteGate?.closes_at, cycle_id: voteGate?.cycle_id };
let failures = 0;
const check = (label, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : extra); if (!ok) failures += 1; };

try {
  cleanup();
  const m1 = as(M1);
  must('profile', await m1('POST', '/api/power-profile', { name: 'Prefill Pia', member_id: M1, pet_power: '1.5M', mystic_trial_score: '777' }));
  must('avail', await m1('POST', '/api/kvk-availability', {
    name: 'Prefill Pia', member_id: M1, current_alliance: 'RED', availability: 'Full battle (12-17 UTC)',
    infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG6', archer_tier: 'T11', archer_tg: 'TG7', heroes: ['Zoe', 'Rosa', 'Saul'],
  }));
  must('prep', await m1('POST', '/api/prep-backpack', { in_game_name: 'Prefill Pia', want_construction: 'Yes', tg_used: '4242', avail_day1: ['12:00'] }));
  must('dragon', await m1('POST', '/api/flamedragon', { name: 'Prefill Pia', current_alliance: '710', infantry_tier: 'T10', infantry_tg: 'TG5', pet_power: '2M' }));
  must('noble', await m1('POST', '/api/noble-advisor', { in_game_name: 'Prefill Pia', want_troop_training: 'Yes', is_transfer: 'No', troop_speedup_days: '5', promoting_t11: 'No', avail_day4: ['00:00'] }));
  must('appt', await m1('POST', '/api/kvk-appointments', { day: 1, buff: 'construction', in_game_name: 'Prefill Pia', tg: '55', ttg: '66', speedup_days: '7', preferred_hours: ['01:00', '02:00', '03:00'] }));
  must('vote', await m1('POST', '/api/event-participation', { form: 'swordland-showdown', vote: 'flexible', power: '123456789' }));
  // M2 only has a Power Profile
  must('profile2', await as(M2)('POST', '/api/power-profile', { name: 'Only Profile', member_id: M2, pet_power: '9M' }));

  for (const [type, label] of [['kvk', 'KvK Prefill QA'], ['flamedragon', 'Flamedragon Prefill QA']]) {
    must('cycle ' + type, await admin('POST', '/api/admin-event-control', { type, action: 'start_cycle', label }));
  }
  must('vote round', await admin('PATCH', '/api/admin-form-gates', { form_key: 'swordland', is_open: true, message: '', opens_at: voteWindow.opens_at, closes_at: voteWindow.closes_at, cycle_id: 'qa-s2-prefill' }));

  const browser = await launch();
  const ctx = await newCtx(browser, { who: 'member', memberId: M1, vp, easy });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 140)));
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 140)));
  const shot = (n) => page.screenshot({ path: `${OUT}/prefill-${vp}${easy ? '-easy' : ''}-${n}.png`, fullPage: true });
  const open = async (path) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(900); };
  const body = () => page.locator('main').innerText();
  const values = () => page.$$eval('main input, main select, main textarea', (els) => els.map((e) => (e.type === 'checkbox' || e.type === 'radio' ? (e.checked ? 'on:' + e.value : '') : e.value)).filter(Boolean));
  const NOTICE = /We filled this in from your answers last cycle/;

  await open('/dashboard/form');
  let v = await values(); let t = await body();
  check('availability: name, alliance, availability prefilled', v.includes('Prefill Pia') && v.includes('RED'), v.join('|'));
  check('availability: troop levels prefilled', ['T11', 'TG8', 'T10', 'TG6', 'TG7'].every((x) => v.includes(x)), v.join('|'));
  check('availability: 3 heroes checked', (await page.locator('.hero-chip.selected').count()) === 3);
  check('availability: notice shown', NOTICE.test(t), t.slice(0, 400));
  await shot('availability');

  await open('/power-profile');
  v = await values(); t = await body();
  check('power profile: name prefilled', v.includes('Prefill Pia'), v.join('|'));
  await open('/power-profile?step=3');
  check('power profile review: saved pet power + mystic score loaded', /1\.5M/.test(await body()) && /777/.test(await body()), (await body()).slice(0, 300));
  check('power profile: no troop/hero steps', !/Troop Levels|Hero Roster/.test(t));
  await shot('power-profile');

  await open('/prep-phase-backpack'); v = await values(); t = await body();
  check('prep: prefilled + notice', v.includes('Prefill Pia') && v.includes('4242') && NOTICE.test(t), v.join('|'));
  await shot('prep');

  await open('/flamedragon'); v = await values(); t = await body();
  check('dragon: prefilled + notice', v.includes('Prefill Pia') && v.includes('T10') && NOTICE.test(t), v.join('|'));
  await shot('dragon');

  await open('/forms/flamedragon-tyrant/noble-advisor'); v = await values(); t = await body();
  check('noble: prefilled + notice', v.includes('Prefill Pia') && v.includes('5') && NOTICE.test(t), v.join('|'));
  await shot('noble');

  await open('/forms/kvk-appointments?tab=apply'); v = await values(); t = await body();
  check('appointments: carried over + notice', v.includes('55') && v.includes('66') && NOTICE.test(t), v.join('|'));
  check('appointments: 3 hours kept', (await page.locator('main [aria-pressed="true"], main input[type=checkbox]:checked').count()) >= 3);
  await shot('appointments');

  await open('/forms/swordland-showdown'); v = await values(); t = await body();
  check('vote: previous vote + power prefilled + notice', v.some((x) => x.includes('flexible')) && v.includes('123456789') && NOTICE.test(t), v.join('|'));
  await shot('vote');

  await open('/forms/requests'); v = await values();
  check('requests: name prefilled, message empty', v.includes('Prefill Pia') && !v.some((x) => x.length > 40), v.join('|'));
  await shot('requests');

  const ctx2 = await newCtx(browser, { who: 'member', memberId: M2, vp, easy });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/prep-phase-backpack', { waitUntil: 'domcontentloaded' });
  await p2.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await p2.waitForTimeout(900);
  const v2 = await p2.$$eval('main input', (els) => els.map((e) => e.value).filter(Boolean));
  const t2 = await p2.locator('main').innerText();
  check('never-filled prep: name from Power Profile + notice', v2.includes('Only Profile') && /what we already know from your Power Profile/.test(t2), t2.slice(0, 300));
  await p2.screenshot({ path: `${OUT}/prefill-${vp}${easy ? '-easy' : ''}-prep-profile-only.png`, fullPage: true });

  check('no console errors', errors.length === 0, errors.join(' || '));
  await browser.close();
} finally {
  await admin('PATCH', '/api/admin-form-gates', { form_key: 'swordland', is_open: true, message: '', opens_at: voteWindow.opens_at, closes_at: voteWindow.closes_at, cycle_id: voteWindow.cycle_id }).catch(() => {});
  cleanup();
}
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
