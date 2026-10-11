// Browser QA for the Power Profile Pet / Masters Power inputs and the read-only sign-in Mystic Trial (dev only).
// Needs a dev server on a LOCAL Mongo and QA_MONGO_DB set to the same database name:
//   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710_profile_qa next dev -p 3015
//   QA_BASE=http://localhost:3015 QA_MONGO_DB=k710_profile_qa node scripts/dev/qa-profile-power.mjs [phone|desktop] [easy]
// Seeds its own members (kingshot_users rows stand in for the sign-in data) and removes them at the end.
import { launch, newCtx, OUT } from './qa-browse.mjs';
import { BASE, mongo } from './qa-lib.mjs';

const vp = process.argv[2] || 'desktop';
const easy = process.argv[3] === 'easy';
const tag = `${vp}${easy ? '-easy' : ''}`;
const M = { login: '920000041', saved: '920000042', differs: '920000043', none: '920000044' };
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', `[${tag}]`, name, extra); };

const { client, db } = await mongo();
const ids = Object.values(M);
async function seed() {
  await db.collection('kingshot_users').deleteMany({ player_id: { $in: ids } });
  await db.collection('power_profiles').deleteMany({ member_id: { $in: ids } });
  const user = (id, mystic) => ({ player_id: id, nickname: `QA ${id.slice(-2)}`, kingdom_id: 710, access_role: 'member', mystic_trial: mystic, power: 123456789 });
  await db.collection('kingshot_users').insertMany([user(M.login, 48250), user(M.saved, null), user(M.differs, 48250), user(M.none, null)]);
  const old = (id, mystic) => ({ member_id: id, name: `QA ${id.slice(-2)}`, mystic_trial_score: mystic, pet_power: '1M', updated_at: new Date('2026-01-01') });
  await db.collection('power_profiles').insertMany([old(M.saved, '1234'), old(M.differs, '1234')]);
}
const dbProfile = (id) => db.collection('power_profiles').findOne({ member_id: id }, { projection: { _id: 0 } });

await seed();
const browser = await launch();
const consoleErrors = [];
const failed = [];

async function open(memberId, step = 0) {
  const ctx = await newCtx(browser, { who: 'member', memberId, vp, easy });
  await ctx.addInitScript(() => { try { localStorage.setItem('k710-tour:power:v1', JSON.stringify({ state: 'skipped', ts: 't' })); } catch {} });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/_next/')) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  await page.goto(`${BASE}/power-profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wizard-form');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page };
}
const nextTo = (page, name) => page.getByRole('button', { name }).first().click();
const shot = (page, name) => page.screenshot({ path: `${OUT}/profile-${name}-${tag}.png`, fullPage: true });

// ---- 1. member with sign-in Mystic Trial, no saved profile ----
{
  const { ctx, page } = await open(M.login);
  await nextTo(page, /Next: Gear/);
  await page.waitForSelector('#pp-pet_power');
  check('Pet / Masters boxes are visible on the Gear step', await page.locator('#pp-pet_power').isVisible() && await page.locator('#pp-masters_power').isVisible());
  check('numeric keyboard hint on phones (inputmode)', (await page.getAttribute('#pp-pet_power', 'inputmode')) === 'decimal');
  await shot(page, 'gear-step-empty');

  // invalid input: announced + focused via the summary, field flagged
  await page.fill('#pp-pet_power', 'lots');
  await nextTo(page, /Next: Review/);
  await page.waitForSelector('#form-error-summary-gear');
  check('error summary is focused', await page.evaluate(() => document.activeElement?.id === 'form-error-summary-gear'));
  check('summary is an alert', (await page.getAttribute('#form-error-summary-gear', 'role')) === 'alert');
  check('field marked invalid and linked to its error', (await page.getAttribute('#pp-pet_power', 'aria-invalid')) === 'true' && /pp-pet_power-error/.test((await page.getAttribute('#pp-pet_power', 'aria-describedby')) || ''));
  check('still on the Gear step', await page.locator('#pp-pet_power').isVisible());
  await shot(page, 'gear-step-error');
  await page.locator('#form-error-summary-gear a').first().click();
  check('summary link focuses the field', await page.evaluate(() => document.activeElement?.id === 'pp-pet_power'));
  await page.fill('#pp-pet_power', '5,000,000,000');
  await nextTo(page, /Next: Review/);
  check('too-big number is refused with a limit message', /cannot be more than/.test(await page.locator('#form-error-summary-gear').innerText()));

  // valid input, keyboard only from the pet box on
  await page.fill('#pp-pet_power', '');
  await page.focus('#pp-pet_power');
  await page.keyboard.type('1.5M');
  await page.keyboard.press('Tab');
  check('thousands separators on blur', (await page.inputValue('#pp-pet_power')) === '1,500,000');
  check('Tab reaches Masters Power', await page.evaluate(() => document.activeElement?.id === 'pp-masters_power'));
  await page.keyboard.type('2250000');
  await page.keyboard.press('Tab');
  check('Masters formatted', (await page.inputValue('#pp-masters_power')) === '2,250,000');
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => /Next: Review/.test(document.activeElement?.textContent || ''))) break;
    await page.keyboard.press('Tab');
  }
  check('keyboard reaches Next: Review', await page.evaluate(() => /Next: Review/.test(document.activeElement?.textContent || '')));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('Review heading focused after Enter', await page.evaluate(() => document.activeElement?.textContent === 'Review & Submit'));

  const reviewText = await page.locator('[data-tour="power-review"]').innerText();
  check('review shows Pet / Masters Power', /Pet Power\s+1,500,000/.test(reviewText) && /Masters Power\s+2,250,000/.test(reviewText), JSON.stringify(reviewText.slice(-160)));
  check('review shows the sign-in Mystic Trial', /Mystic Trial Total Score\s+48,250/.test(reviewText));
  check('review says it is from the sign-in', /From your Kingshot sign-in/.test(reviewText));
  await shot(page, 'review');
  // Edit goes back to the boxes
  await page.locator('.wizard-review-card', { hasText: 'Additional Power' }).getByRole('button', { name: 'Edit' }).click();
  check('Edit on Additional Power opens the Gear step', await page.locator('#pp-pet_power').isVisible());
  await nextTo(page, /Next: Review/);
  await page.getByRole('button', { name: 'Save Power Profile' }).click();
  await page.waitForSelector('.status:not(.error)', { timeout: 8000 });
  const saved = await dbProfile(M.login);
  check('saved Pet / Masters Power are plain digits', saved?.pet_power === '1500000' && saved?.masters_power === '2250000', JSON.stringify({ p: saved?.pet_power, m: saved?.masters_power }));
  check('saved Mystic Trial equals the sign-in value', saved?.mystic_trial_score === '48250');

  // reload: prefill
  await page.goto(`${BASE}/power-profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wizard-form');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  await nextTo(page, /Next: Gear/);
  check('reload prefills Pet Power', (await page.inputValue('#pp-pet_power')) === '1,500,000');
  check('reload prefills Masters Power', (await page.inputValue('#pp-masters_power')) === '2,250,000');
  await shot(page, 'gear-step-prefilled');
  await ctx.close();
}

// ---- 2. older typed Mystic value differs from the sign-in value: sign-in wins, in review and in the saved row ----
{
  const { ctx, page } = await open(M.differs);
  await nextTo(page, /Next: Gear/);
  check('legacy "1M" pet value is shown as 1,000,000', (await page.inputValue('#pp-pet_power')) === '1,000,000');
  await nextTo(page, /Next: Review/);
  const text = await page.locator('[data-tour="power-review"]').innerText();
  check('review shows the sign-in value, not the older typed one', /Mystic Trial Total Score\s+48,250/.test(text) && !/1,234/.test(text));
  await page.getByRole('button', { name: 'Save Power Profile' }).click();
  await page.waitForSelector('.status:not(.error)', { timeout: 8000 });
  check('saved row now holds the sign-in value', (await dbProfile(M.differs))?.mystic_trial_score === '48250');
  await ctx.close();
}

// ---- 3. no sign-in Mystic value, older saved one exists: kept and labelled ----
{
  const { ctx, page } = await open(M.saved);
  await nextTo(page, /Next: Gear/);
  await nextTo(page, /Next: Review/);
  const text = await page.locator('[data-tour="power-review"]').innerText();
  check('saved value shown with a "not available from sign-in" note', /Mystic Trial Total Score\s+1,234/.test(text) && /Not available from your Kingshot sign-in/.test(text));
  await shot(page, 'review-saved-fallback');
  await page.getByRole('button', { name: 'Save Power Profile' }).click();
  await page.waitForSelector('.status:not(.error)', { timeout: 8000 });
  check('saving keeps the previously saved value', (await dbProfile(M.saved))?.mystic_trial_score === '1234');
  await ctx.close();
}

// ---- 4. nothing known anywhere ----
{
  const { ctx, page } = await open(M.none);
  await nextTo(page, /Next: Gear/);
  await nextTo(page, /Next: Review/);
  const text = await page.locator('[data-tour="power-review"]').innerText();
  check('"Not available" state is clear', /Mystic Trial Total Score\s+Not available/.test(text) && /Not available yet/.test(text));
  await shot(page, 'review-not-available');
  await ctx.close();
}

check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
check('no failed requests', failed.length === 0, failed.join(' | '));

await db.collection('kingshot_users').deleteMany({ player_id: { $in: ids } });
await db.collection('power_profiles').deleteMany({ member_id: { $in: ids } });
await client.close();
await browser.close();
const bad = results.filter((r) => !r).length;
console.log(bad ? `${bad} FAILED` : 'ALL PASSED', `(${results.length} checks)`);
process.exit(bad ? 1 : 0);
