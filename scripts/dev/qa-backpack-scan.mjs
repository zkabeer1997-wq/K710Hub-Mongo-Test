// Dev-only Playwright journey: Backpack scan on the KvK Prep and Noble Advisor forms.
// Run (own dev server, LOCAL mongod only, own DB):
//   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710hub_bpscan npx next dev -p 3013
//   QA_BASE=http://localhost:3013 QA_MONGO_DB=k710hub_bpscan node scripts/dev/qa-backpack-scan.mjs
// Uses member 940000001 on the real fixture screenshots; deletes its rows afterwards. Screenshots: <scratchpad>/qa/backpack-*.png
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { client, adminLogin, memberCookie, BASE, loadEnv, ROOT, mongo } from './qa-lib.mjs';
import { launch, newCtx, OUT } from './qa-browse.mjs';

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('local only');
const M = '940000001';
const FIX = path.join(ROOT, 'tests/fixtures/scan/backpack-inventory');
const RES = path.join(FIX, 'resources.png');
const SPD = path.join(FIX, 'speedups.png');
const env = loadEnv();
const adminCookie = await adminLogin(env);
const admin = client(adminCookie);
const member = client(memberCookie(M, env));
let failures = 0;
const check = (label, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : extra); if (!ok) failures += 1; };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// temp images: a non-backpack picture and a cropped screenshot
const NOT = path.join(OUT, 'backpack-not-a-backpack.png');
writeFileSync(NOT, await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#335577' } }).png().toBuffer());
const CROP = path.join(OUT, 'backpack-cropped.png');
writeFileSync(CROP, await sharp(SPD).extract({ left: 0, top: 380, width: 1284, height: 1000 }).png().toBuffer());

async function setup() {
  for (const type of ['kvk', 'flamedragon']) {
    const st = await admin('GET', `/api/admin-event-control?type=${type}`);
    if (!st.json?.cycle?.id) await admin('POST', '/api/admin-event-control', { type, action: 'start_cycle', label: `Backpack QA ${type}` });
  }
  for (const key of ['prep', 'noble']) await admin('PATCH', '/api/admin-form-gates', { form_key: key, is_open: true, message: '' });
  await member('POST', '/api/power-profile', { name: 'Scan Sam', member_id: M, pet_power: '1M' }).catch(() => {});
}
async function cleanup() {
  const { client: mc, db } = await mongo();
  for (const c of ['prep_backpack', 'noble_advisor_submissions', 'scan_corrections', 'power_profiles', 'submissions']) await db.collection(c).deleteMany({ member_id: M });
  await mc.close();
}

const errors = [];
async function ctxFor(browser, vp, easy = false) {
  const ctx = await newCtx(browser, { who: 'member', memberId: M, vp, easy });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(`${vp}: ${m.text().slice(0, 140)}`));
  page.on('pageerror', (e) => errors.push(`${vp} pageerror: ${e.message.slice(0, 140)}`));
  return { ctx, page };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/backpack-${name}.png`, fullPage: full });
async function open(page, p) { await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(800); const skip = page.getByRole('button', { name: 'Skip tour' }); if (await skip.count()) await skip.first().click().catch(() => {}); }
async function pick(page, files) {
  await page.setInputFiles('.bps input[type=file]', files);
  await page.waitForSelector('.bps-review, .lo-scan-error', { timeout: 30000 });
}
const val = (page, label) => page.getByLabel(label, { exact: false }).first().inputValue();

async function prepJourney(browser, vp) {
  const { ctx, page } = await ctxFor(browser, vp);
  await open(page, '/prep-phase-backpack');
  check(`[${vp}] card is on the prep form`, await page.locator('.bps').count() === 1);
  await shot(page, `${vp}-prep-1-card`);
  // typed value that must not be replaced without confirmation
  await page.getByLabel('Day 1', { exact: false }).first().check().catch(() => {});
  await page.locator('input[name="prep-day1"][value="Yes"]').check({ force: true });
  await page.getByLabel('How much TG do you own?').fill('1234');
  // non-backpack image
  const ttgBefore = await val(page, 'How much TTG do you own?');
  await pick(page, NOT);
  check(`[${vp}] non-backpack picture: friendly error, nothing filled`, /does not look like Backpack/.test(await page.locator('.lo-scan-error').innerText()) && await val(page, 'How much TTG do you own?') === ttgBefore);
  await shot(page, `${vp}-prep-2-error`);
  // both screenshots at once
  await pick(page, [SPD, RES]);
  await page.waitForTimeout(300);
  check(`[${vp}] review shows both groups`, await page.locator('.bps-review').count() === 1);
  const text = await page.locator('.bps-review').innerText();
  check(`[${vp}] review: ground-truth TG/TTG/Dust`, /TG\s*8,018/.test(text) && /TTG\s*280/.test(text) && /TG Dust\s*11/.test(text), text.slice(0, 200));
  check(`[${vp}] review: troop 2.5 days and research line`, /2\.5/.test(text) && /Research days include general speedups/.test(text), text.slice(-600));
  check(`[${vp}] healing (green plus) is not shown`, !/Healing|Other speedups/i.test(text));
  check(`[${vp}] review: no horizontal scroll`, await noOverflow(page));
  await shot(page, `${vp}-prep-3-review`, true);
  // edit one number in review: construction... change troop 1 min 373 -> 400 (+27 min)
  const troopInput = page.locator('.bps-row', { hasText: 'Troop training · 1 min' });
  await troopInput.getByRole('button', { name: /Change/ }).click();
  await troopInput.locator('input.bps-input').fill('400');
  const after = await page.locator('.bps-review').innerText();
  check(`[${vp}] edit in review changes the totals`, /3,620/.test(after), after.slice(-500));
  // typed value confirm: TG typed 1234 must not be replaced unless confirmed
  const replaceBox = page.getByLabel(/Replace what I typed \(1234\)/);
  check(`[${vp}] replace-confirm shown for the typed TG`, await replaceBox.count() === 1);
  await shot(page, `${vp}-prep-3b-before-use`, false);
  await page.getByRole('button', { name: 'Use these numbers' }).click({ timeout: 8000 }).catch(async () => { console.log('USE BTN:', await page.locator('.bps-review .lo-rv-actions').innerText()); throw new Error('use button'); });
  await page.waitForTimeout(400);
  check(`[${vp}] TTG filled`, await val(page, 'How much TTG do you own?') === '280');
  check(`[${vp}] typed TG kept (not confirmed)`, await val(page, 'How much TG do you own?') === '1234');
  await page.locator('input[name="prep-day2"][value="Yes"]').check({ force: true });
  await page.locator('input[name="prep-day4"][value="Yes"]').check({ force: true });
  check(`[${vp}] TG Dust filled`, await val(page, 'How much TG Dust do you own?') === '11');
  check(`[${vp}] research days (research+general) filled`, await val(page, 'How many days of research speedups do you own?') === '3');
  check(`[${vp}] troop days (400 edit) filled`, await val(page, 'How many days of troop speedups do you own?') === '2.51');
  check(`[${vp}] 'from your backpack scan' notes shown`, await page.locator('[data-scan-note="scan"]').count() >= 4);
  await shot(page, `${vp}-prep-4-filled`, true);
  // edit a field then submit
  await page.getByLabel('How much TG do you own?').fill('999');
  for (const d of [1, 2, 4]) {
    await page.locator(`input[name="prep-day${d}"][value="Yes"]`).check({ force: true });
  }
  const slots = page.locator('.prep-slot-group');
  for (let i = 0; i < await slots.count(); i += 1) { const b = slots.nth(i).locator('.prep-slot').first(); if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click(); }
  await page.locator('input[name="prep-day5"][value="No"]').check({ force: true });
  await page.getByLabel('Are you a transfer?').selectOption('No');
  await page.getByLabel('Are you promoting to T11 troops?').selectOption('No');
  await page.getByLabel('Your in-game name').fill('Scan Sam');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('.prep2-saved', { timeout: 15000 }).catch(async () => { console.log('SAVE ERR:', (await page.locator('.prep-err-box, .prep-err').allInnerTexts()).join(' | ')); await shot(page, `${vp}-prep-save-error`, true); throw new Error('save failed'); });
  check(`[${vp}] saved`, true);
  await ctx.close();
}

async function checkSaved() {
  const r = await member('GET', '/api/prep-backpack');
  const rec = r.json?.record || {};
  check('api: ttg_used saved 280 with scan snapshot', rec.ttg_used === '280' && rec.backpack_scan?.ttg === 280 && rec.backpack_scan?.speedup_minutes?.troop === 3620, JSON.stringify(rec.backpack_scan));
  check('api: sources scan/typed', rec.backpack_sources?.ttg_used === 'scan' && rec.backpack_sources?.tg_used === 'typed', JSON.stringify(rec.backpack_sources));
  check('api: no other speedup minutes saved', rec.backpack_scan && !('other' in rec.backpack_scan.speedup_minutes));
  const { client: mc, db } = await mongo();
  const corr = await db.collection('scan_corrections').find({ member_id: M, kind: 'backpack_inventory' }).toArray();
  await mc.close();
  check('scan_corrections recorded the edit (read 373, chosen 400)', corr.some((c) => c.slot === 'speedup.troop.1m' && c.field === 'quantity' && c.read_value === 373 && c.corrected_value === 400), JSON.stringify(corr.map((c) => [c.slot, c.field, c.read_value, c.corrected_value])));
  const bad = await member('POST', '/api/prep-backpack', { in_game_name: 'x', backpack_scan: { scanned_at: new Date().toISOString(), tg: -4, ttg: null, tg_dust: null, speedup_minutes: { construction: null, research: null, troop: null, general: null } } });
  check('api: negative scan number is rejected', bad.status === 400);
}

async function reload(browser, vp) {
  const { ctx, page } = await ctxFor(browser, vp);
  await open(page, '/prep-phase-backpack');
  check(`[${vp}] reload: values prefilled`, await val(page, 'How much TTG do you own?') === '280' && await val(page, 'How much TG do you own?') === '999');
  const notes = await page.locator('[data-scan-note]').allInnerTexts();
  check(`[${vp}] reload: "scanned on <date>" note`, notes.some((n) => /From your backpack scan on/i.test(n)) && notes.some((n) => /You changed this\. Your scan said 8018/i.test(n)), notes.join(' | '));
  await shot(page, `${vp}-prep-5-reload`, true);
  await ctx.close();
}

async function variants(browser) {
  const { ctx, page } = await ctxFor(browser, 'desktop');
  await open(page, '/prep-phase-backpack');
  await pick(page, SPD);
  const t1 = await page.locator('.bps-review').innerText();
  check('one screenshot (speedups only): resources left alone', /No Resources screenshot was added/.test(t1));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await pick(page, RES);
  const t2 = await page.locator('.bps-review').innerText();
  check('one screenshot (resources only): fill list says speedups not added', /nothing \(that screenshot was not added\)/.test(t2));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await pick(page, CROP);
  check('cropped screenshot is read', /read confidently/.test(await page.locator('.bps-review').innerText()));
  await page.getByRole('button', { name: 'Cancel' }).click();
  await pick(page, [SPD, SPD]);
  const t3 = await page.locator('.bps-review').innerText();
  check('same image twice: counted once with a note', /same screenshot/.test(t3) && /2\.5/.test(t3));
  await shot(page, 'desktop-prep-6-twice', true);
  // keyboard only: focus the review heading, Tab to Use button, Enter in a number box does not submit the form
  const urlBefore = page.url();
  await page.locator('.bps-row').first().getByRole('button', { name: /Change/ }).click();
  await page.locator('.bps-row input.bps-input').first().press('Enter');
  await page.waitForTimeout(300);
  check('Enter inside a review number box does not submit the form', page.url() === urlBefore && await page.locator('.prep2-saved').count() === 0 && await page.locator('.bps-review').count() === 1);
  await page.getByRole('button', { name: 'Use these numbers' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('keyboard: Use these numbers via Enter, focus returns to the card', await page.evaluate(() => document.activeElement?.closest('.bps') !== null));
  await ctx.close();
}

async function nobleJourney(browser, vp, easy = false) {
  const { ctx, page } = await ctxFor(browser, vp, easy);
  await open(page, '/forms/flamedragon-tyrant/noble-advisor');
  check(`[${vp}${easy ? ' easy' : ''}] compact card on the noble form`, await page.locator('.bps-compact').count() === 1);
  await pick(page, RES);
  check(`[${vp}] noble: resources picture gets a clear message`, /only uses Speedups/.test(await page.locator('.lo-scan-error').innerText()));
  await pick(page, SPD);
  const t = await page.locator('.bps-review').innerText();
  check(`[${vp}] noble review: troop 2.5 days, no resource rows`, /2\.5/.test(t) && !/True Gold|TG Dust/.test(t));
  check(`[${vp}] noble: no horizontal scroll`, await noOverflow(page));
  await shot(page, `${vp}${easy ? '-easy' : ''}-noble-1-review`, true);
  await page.getByRole('button', { name: 'Use these numbers' }).click();
  await page.waitForTimeout(300);
  check(`[${vp}] noble: troop days filled with 2.5`, await val(page, 'How many days of troop speedups do you own?') === '2.5');
  if (!easy) {
    await page.getByLabel('Do you want a Troop Training appointment?').selectOption('Yes');
    await page.getByLabel('Are you a transfer?').selectOption('No');
    await page.getByLabel('Promoting to T11 troops?').selectOption('No');
    const slot = page.locator('.prep-slot').first();
    if ((await slot.getAttribute('aria-pressed')) !== 'true') await slot.click();
    await page.getByLabel('In-game name').first().fill('Scan Sam');
    await page.getByRole('button', { name: /Save Noble Advisor booking/ }).click();
    await page.waitForSelector('text=Saved.', { timeout: 15000 }).catch(async () => { console.log('NOBLE ERR:', (await page.locator('[role=status]').allInnerTexts()).join(' | ')); throw new Error('noble save'); });
    const r = await member('GET', '/api/noble-advisor');
    check('noble api: snapshot + source saved, troop days 2.5', r.json?.record?.troop_speedup_days === '2.5' && r.json?.record?.backpack_sources?.troop_speedup_days === 'scan' && r.json?.record?.backpack_scan?.speedup_minutes?.troop === 3593, JSON.stringify(r.json?.record?.backpack_scan));
  }
  await shot(page, `${vp}${easy ? '-easy' : ''}-noble-2-filled`, true);
  await ctx.close();
}

async function adminView(browser) {
  const ctx = await newCtx(browser, { who: 'admin', adminCookie, vp: 'desktop' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('admin pageerror: ' + e.message.slice(0, 140)));
  await open(page, '/admin/dashboard/prep-ministers');
  check('admin: Scanned mark on prep rows', await page.locator('.admin-scan-tag').count() >= 1);
  check('admin: >10% difference hint (typed TG 999 vs scan 8018)', /typed 999, scan said 8018/.test(await page.locator('main').innerText()));
  await shot(page, 'desktop-admin-prep', false);
  await open(page, '/admin/dashboard/noble-advisor');
  check('admin: Scanned mark on noble rows', await page.locator('.admin-scan-tag').count() >= 1);
  await ctx.close();
}

let browser;
try {
  await setup();
  await cleanup();
  browser = await launch();
  await prepJourney(browser, 'desktop');
  await checkSaved();
  await reload(browser, 'desktop');
  await variants(browser);
  await prepJourney(browser, 'phone').catch((e) => { check('phone prep journey', false, e.message.slice(0, 200)); });
  await nobleJourney(browser, 'desktop');
  await nobleJourney(browser, 'phone');
  await nobleJourney(browser, 'phone', true);
  await adminView(browser);
} finally {
  await browser?.close();
  await cleanup();
}
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await sleep(100);
process.exit(failures ? 1 : 0);
