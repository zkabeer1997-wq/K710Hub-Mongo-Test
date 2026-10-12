// Browser QA for the Flamedragon Tyrant form's shared Power Profile block (dev only).
// Needs a dev server on a LOCAL Mongo and QA_MONGO_DB set to the same database name:
//   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710_dragon_pp_qa next dev -p 3016
//   QA_BASE=http://localhost:3016 QA_MONGO_DB=k710_dragon_pp_qa node scripts/dev/qa-dragon-power.mjs [phone|desktop] [easy]
// Seeds its own members + form gates in that local database and removes them at the end. The screenshot used for
// the scan is a real fixture from tests/fixtures/scan (read in the browser, never uploaded).
import path from 'node:path';
import { launch, newCtx, audit, OUT } from './qa-browse.mjs';
import { BASE, ROOT, mongo } from './qa-lib.mjs';

const vp = process.argv[2] || 'desktop';
const easy = process.argv[3] === 'easy';
const tag = `${vp}${easy ? '-easy' : ''}`;
const FIXTURE = path.join(ROOT, 'tests/fixtures/scan/governor_profile/profile-001.png');
const A = '920000051';
const B = '920000052';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', `[${tag}]`, name, extra); };

const { client, db } = await mongo();
if (!/dragon_pp_qa|qa/i.test(db.databaseName)) throw new Error('Refusing: unexpected database ' + db.databaseName);
const ids = [A, B];
const dbProfile = (id) => db.collection('power_profiles').findOne({ member_id: id }, { projection: { _id: 0 } });
const dbDragon = (id) => db.collection('flamedragon_forms').findOne({ member_id: id }, { projection: { _id: 0 } });
async function seed() {
  for (const c of ['kingshot_users', 'power_profiles', 'flamedragon_forms', 'scan_corrections']) {
    await db.collection(c).deleteMany(c === 'kingshot_users' ? { player_id: { $in: ids } } : { member_id: { $in: ids } });
  }
  await db.collection('form_gates').deleteMany({});
  await db.collection('kingshot_users').insertMany(ids.map((id) => ({ player_id: id, nickname: `QA ${id.slice(-2)}`, kingdom_id: 710, access_role: 'member', mystic_trial: 48250, power: 123456789 })));
}
async function gates({ lead, dragon }) {
  await db.collection('form_gates').deleteMany({});
  await db.collection('form_gates').insertMany([['lead', lead], ['dragon', dragon]].map(([form_key, open]) => ({ form_key, is_open: open, message: '', opens_at: null, closes_at: null, cycle_id: 'current', round_label: '' })));
}

await seed();
const browser = await launch();
const consoleErrors = [];
const failed = [];

async function open(memberId, route) {
  const ctx = await newCtx(browser, { who: 'member', memberId, vp, easy });
  await ctx.addInitScript(() => { try { for (const id of ['dragon', 'power']) localStorage.setItem(`k710-tour:${id}:v1`, JSON.stringify({ state: 'skipped', ts: 't' })); } catch {} });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('response', (r) => { if (r.status() >= 400 && !/_next\//.test(r.url())) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page };
}
const shot = (page, name, opts = {}) => page.screenshot({ path: `${OUT}/dragon-power-${name}-${tag}.png`, ...opts });
const powerSection = (page) => page.locator('[data-tour="dragon-power"]').locator('xpath=..');
async function fillTroops(page) {
  for (const [id, v] of [['infantry-tier', 'T11'], ['infantry-tg', 'TG8'], ['cavalry-tier', 'T10'], ['cavalry-tg', 'TG6'], ['archer-tier', 'T11'], ['archer-tg', 'TG7']]) {
    await page.selectOption(`#troop-${id}`, v);
  }
}
const submit = async (page) => {
  await page.getByRole('button', { name: /Submit Flamedragon form/ }).click();
  await page.waitForFunction(() => /Submitted|Updated|closed|Could not|cannot|not open/i.test(document.querySelector('form .status')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  return (await page.locator('form .status').first().textContent().catch(() => '')) || '';
};

// ---- 1. Flamedragon form: layout, shared line, read-only Mystic ----
{
  const { ctx, page } = await open(A, '/flamedragon');
  const section = powerSection(page);
  await section.scrollIntoViewIfNeeded();
  check('shared-with-Power-Profile line is shown', await page.getByText('Saved to your Power Profile too, so you only enter this once.').isVisible());
  check('old charm/gear dropdowns are gone', (await page.locator('.charm-grid, .governor-gear-grid').count()) === 0);
  check('loadout board is shown', await page.locator('.lo-board, .lo').first().isVisible());
  check('Pet and Masters boxes are visible', await page.locator('#fd-pet_power').isVisible() && await page.locator('#fd-masters_power').isVisible());
  const mystic = (await page.getByTestId('dragon-mystic').textContent()) || '';
  check('Mystic Trial is read-only from sign-in', /48,250/.test(mystic) && /Kingshot sign-in/.test(mystic) && (await page.getByTestId('dragon-mystic').locator('input').count()) === 0, mystic.slice(0, 80));
  await section.scrollIntoViewIfNeeded();
  await shot(page, '1-section-initial', { fullPage: true });

  // ---- 2. keyboard: reach the scan button and the number boxes with Tab, open the chooser with Enter ----
  await page.locator('#troop-archer-tg').focus();
  let reached = '';
  for (let i = 0; i < 400 && reached !== 'Scan a screenshot'; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => (document.activeElement?.textContent || '').trim());
  }
  check('Tab reaches "Scan a screenshot"', reached === 'Scan a screenshot');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.keyboard.press('Enter')]);
  check('Enter on the scan button opens the file chooser', Boolean(chooser));
  const focusRing = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow !== 'none'}`; });
  check('scan button shows a focus indicator', !/^none /.test(focusRing) || /true/.test(focusRing), focusRing);

  // ---- 3. scan a real screenshot, review, use ----
  if (chooser) await chooser.setFiles(FIXTURE); else await page.setInputFiles('input[type=file]', FIXTURE);
  await page.waitForSelector('#lo-rv-title', { timeout: 20000 });
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole('button', { name: 'Use these values' }).isEnabled()) break;
    const change = page.locator('.lo-rv-list button[aria-label^="Change"]').filter({ has: page.locator('xpath=.') });
    // open the first row still marked "Check this" and confirm it
    const row = page.locator('.lo-rv-list li', { has: page.locator('.lo-rv-badge[data-state="check"]') }).first();
    if (!(await row.count())) break;
    const btn = row.locator('button[aria-label^="Change"]');
    if (await btn.count()) await btn.click();
    const confirmBtn = row.getByRole('button', { name: /This is right|Leave it empty/ });
    if (await confirmBtn.count()) await confirmBtn.click();
    void change;
  }
  await shot(page, '2-scan-review', { fullPage: false });
  check('"Use these values" becomes available', await page.getByRole('button', { name: 'Use these values' }).isEnabled());
  await page.getByRole('button', { name: 'Use these values' }).click();
  await page.getByText(/Saved to your Power Profile too\. Press Submit/).waitFor({ timeout: 8000 }).catch(() => {});
  check('scan saved to the Power Profile immediately (message)', await page.getByText(/Saved to your Power Profile too\. Press Submit/).isVisible());
  let prof = await dbProfile(A);
  check('profile row has gear + charms from the scan', Boolean(prof?.governor_gear) && Boolean(prof?.charms), `${(prof?.governor_gear || '').slice(0, 40)}`);
  check('mystic not written by the scan', prof?.mystic_trial_score == null);

  // ---- 4. Pet / Masters: validation + formatting, edit a number, submit ----
  await page.fill('#fd-pet_power', 'lots');
  await fillTroops(page);
  await page.getByRole('button', { name: /Submit Flamedragon form/ }).click();
  await page.waitForSelector('#form-error-summary-power', { timeout: 4000 }).catch(() => {});
  check('bad Pet Power: summary takes focus and the box is flagged inline', (await page.getByText(/Pet Power: type a whole number/).first().isVisible()) && (await page.evaluate(() => document.activeElement?.id)) === 'form-error-summary-power' && (await page.getAttribute('#fd-pet_power', 'aria-invalid')) === 'true');
  await page.locator('#form-error-summary-power a').first().click();
  check('the summary link focuses the Pet Power box', (await page.evaluate(() => document.activeElement?.id)) === 'fd-pet_power');
  await shot(page, '3-pet-error', { fullPage: false });
  await page.fill('#fd-pet_power', '1500000');
  await page.locator('#fd-masters_power').click();
  await page.fill('#fd-masters_power', '2250000');
  await page.locator('#fd-pet_power').click();
  check('thousands separators on leaving a box', (await page.inputValue('#fd-masters_power')) === '2,250,000');
  await page.fill('#fd-pet_power', '1,600,000'); // edited number
  const msg = await submit(page);
  check('Flamedragon submit succeeds', /Submitted|Updated/.test(msg), msg);
  await shot(page, '4-after-submit', { fullPage: true });
  const fd = await dbDragon(A);
  prof = await dbProfile(A);
  check('Flamedragon record stores plain-digit pet/masters', fd?.pet_power === '1600000' && fd?.masters_power === '2250000');
  check('Power Profile got gear, charms, pet and masters', prof?.pet_power === '1600000' && prof?.masters_power === '2250000' && prof?.governor_gear === fd?.governor_gear && prof?.charms === fd?.charms);
  check('Power Profile has the member name', Boolean(prof?.name));
  check('Mystic Trial from sign-in on the Flamedragon record', fd?.mystic_trial_score === '48250');
  const dims = await audit(page);
  check('no horizontal scroll on the Flamedragon form', !dims.overflowX);
  await ctx.close();
}

// ---- 5. Power Profile shows it; change a value there ----
{
  const { ctx, page } = await open(A, '/power-profile');
  await page.getByRole('button', { name: /Next: Gear/ }).click();
  await page.waitForSelector('#pp-pet_power');
  check('Power Profile shows Pet Power from the Flamedragon form', (await page.inputValue('#pp-pet_power')) === '1,600,000');
  check('Power Profile shows Masters Power from the Flamedragon form', (await page.inputValue('#pp-masters_power')) === '2,250,000');
  check('Power Profile shows the gear/charms count', /charm|gear/i.test((await page.locator('.lo-count').first().textContent()) || ''));
  await shot(page, '5-power-profile-gear', { fullPage: true });
  await page.fill('#pp-pet_power', '9000000');
  await page.getByRole('button', { name: /Next: Review/ }).click();
  await page.getByRole('button', { name: /Save Power Profile/ }).click();
  await page.getByText(/Power Profile (created|updated)\./).waitFor({ timeout: 8000 }).catch(() => {});
  check('Power Profile saved with the new Pet Power', (await dbProfile(A))?.pet_power === '9000000');
  check('no horizontal scroll on the Power Profile', !(await audit(page)).overflowX);
  await ctx.close();
}

// ---- 6. reopen the Flamedragon form: the newer profile value is offered ----
{
  const { ctx, page } = await open(A, '/flamedragon');
  await powerSection(page).scrollIntoViewIfNeeded();
  check('newer Power Profile Pet Power is offered', (await page.inputValue('#fd-pet_power')) === '9,000,000');
  check('older Masters value kept', (await page.inputValue('#fd-masters_power')) === '2,250,000');
  check('"filled in from your Power Profile" note is shown', await page.getByText(/filled these in from your Power Profile/).isVisible());
  await shot(page, '6-newer-profile-offered', { fullPage: true });

  // ---- 7. gates ----
  await gates({ lead: false, dragon: true });
  await page.fill('#fd-masters_power', '3,000,000');
  const open1 = await submit(page);
  check('closed Power Profile gate does not block the Flamedragon save', /Submitted|Updated/.test(open1), open1);
  check('...and it still wrote across', (await dbProfile(A))?.masters_power === '3000000');
  const scan1 = await page.evaluate(async () => (await fetch('/api/power-profile/loadout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'dragon', governor_gear: '', charms: '' }) })).status);
  const scan2 = await page.evaluate(async () => (await fetch('/api/power-profile/loadout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ governor_gear: '', charms: '' }) })).status);
  check('scan save from the Flamedragon form passes while only the Power Profile gate is closed', scan1 === 200, String(scan1));
  check('scan save without source is still blocked by the Power Profile gate', scan2 === 403, String(scan2));
  await gates({ lead: true, dragon: false });
  await page.fill('#fd-masters_power', '4,000,000');
  const closed = await submit(page);
  check('closed Flamedragon gate blocks the save with a message', !/Submitted|Updated/.test(closed) && closed.length > 5, closed);
  await shot(page, '7-dragon-gate-closed', { fullPage: false });
  check('blocked save wrote nothing', (await dbProfile(A))?.masters_power === '3000000');
  const scan3 = await page.evaluate(async () => (await fetch('/api/power-profile/loadout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'dragon', governor_gear: '', charms: '' }) })).status);
  check('scan save from the Flamedragon form is blocked by the closed Flamedragon gate', scan3 === 403, String(scan3));
  await gates({ lead: true, dragon: true });
  await ctx.close();
}

// ---- 8. a brand-new member: scan-less save with only numbers creates the profile ----
{
  const { ctx, page } = await open(B, '/flamedragon');
  await fillTroops(page);
  await page.fill('#fd-pet_power', '5000');
  const m = await submit(page);
  check('new member saves', /Submitted/.test(m), m);
  const p = await dbProfile(B);
  check('profile created with name and pet power only', Boolean(p?.name) && p?.pet_power === '5000' && !p?.governor_gear);
  await ctx.close();
}

await seed();
await db.collection('form_gates').deleteMany({});
for (const c of ['kingshot_users']) await db.collection(c).deleteMany({ player_id: { $in: ids } });
for (const c of ['power_profiles', 'flamedragon_forms', 'scan_corrections']) await db.collection(c).deleteMany({ member_id: { $in: ids } });
await browser.close();
await client.close();
const real = consoleErrors.filter((e) => !/Failed to load resource/.test(e));
check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));
console.log('HTTP >= 400 seen:', [...new Set(failed)].join(', ') || 'none');
console.log(results.every(Boolean) ? 'ALL PASS' : `FAILURES: ${results.filter((r) => !r).length}`);
process.exit(results.every(Boolean) ? 0 : 1);
