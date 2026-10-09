// Browser QA for the /interest "Verify with your Kingshot account" flow (dev only).
// Needs: scripts/dev/mock-kingshot-server.mjs running, a dev server started with the
// KINGSHOT_* env vars pointing at it and a LOCAL Mongo, and QA_BASE=<that server>.
//   QA_BASE=http://localhost:3112 node scripts/dev/qa-interest-verify.mjs <scenario> [phone|desktop] [easy]
// scenarios: verified | nulls | skip | expired | different | member | admin
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { launch, newCtx, OUT } from './qa-browse.mjs';
import { BASE, makePng, adminLogin, loadEnv, memberCookie } from './qa-lib.mjs';

const scenario = process.argv[2] || 'verified';
const vp = process.argv[3] || 'phone';
const easy = process.argv[4] === 'easy';
const tag = `${scenario}-${vp}${easy ? '-easy' : ''}`;
const SHOT = `${OUT}/shot.png`;
writeFileSync(SHOT, makePng(200, 120));
// Unique Player IDs per run (the last digit picks the mock scenario) so the per-player code limit never interferes.
const pid = (d) => `12${String(Date.now()).slice(-6)}${d}`;
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name, extra]); console.log(ok ? 'PASS' : 'FAIL', name, extra); };

const browser = await launch();
const ctx = await newCtx(browser, { who: 'none', vp, easy });
await ctx.addInitScript(() => { try { localStorage.setItem('k710-tour:interest:v2', JSON.stringify({ state: 'skipped', ts: 't' })); } catch {} });
const page = await ctx.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/_next/')) failedRequests.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });

const shot = (name) => page.screenshot({ path: `${OUT}/iv-${tag}-${name}.png`, fullPage: false });
const panelShot = (name) => page.locator('.verify-panel').first().screenshot({ path: `${OUT}/iv-${tag}-${name}.png` });
async function gotoInterest() {
  await page.goto(`${BASE}/interest`);
  await page.waitForSelector('.apply-form');
  await page.waitForSelector('#verify-title');
}
async function verifyWith(playerId) {
  await page.fill('#verify-player-id', playerId);
  await page.getByRole('button', { name: /Open Kingshot, then send my code/ }).click();
  await page.waitForSelector('#verify-code');
  check(`${tag}: focus moves to the code field`, await page.evaluate(() => document.activeElement?.id === 'verify-code'));
  await page.fill('#verify-code', '123456');
  await page.keyboard.press('Enter'); // Enter must verify, not move the wizard on
  await page.waitForSelector('.verify-panel.is-verified');
}
const val = (id) => page.inputValue(`#${id}`);
const ro = (id) => page.$eval(`#${id}`, (e) => e.readOnly);

async function fillStep() {
  const ids = { 'f-discordUsername': 'qa_applicant', 'f-inGameName': 'Typed Name', 'f-playerId': '8800110', 'f-currentServer': '523', 'f-currentAlliance': 'TypedAlliance', 'f-totalPower': '55,000,000', 'f-currentTg': '4,000', 'f-mysticTrialScore': '12,345', 'f-passesRequired': '1', 'f-currentPasses': '2' };
  for (const [id, v] of Object.entries(ids)) {
    const el = page.locator(`#${id}`);
    if (!(await el.count()) || !(await el.isVisible())) continue;
    if (await el.evaluate((e) => e.readOnly || e.value)) continue;
    await el.fill(v);
  }
  for (const g of await page.locator('fieldset.apply-group:visible').all()) {
    if (await g.locator('input:checked').count()) continue;
    const labels = g.locator('label.apply-choice');
    const n = await labels.count();
    const text = await g.innerText();
    await labels.nth(/T11/.test(text) ? n - 1 : 0).click();
  }
  if (await page.locator('#f-screenshots').count()) await page.setInputFiles('#f-screenshots', SHOT);
  await page.waitForTimeout(300);
}
async function walkAndSubmit() {
  for (let i = 0; i < 6; i += 1) {
    await fillStep();
    if (await page.locator('button[type=submit]').count()) break;
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.waitForTimeout(500);
    const errs = await page.locator('.field-error:visible').allInnerTexts();
    if (errs.length) { console.log('  field errors', errs); }
  }
  await shot('review');
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('.apply-done, [class*=petition]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

if (scenario === 'verified' || scenario === 'nulls') {
  await gotoInterest();
  await panelShot('panel-initial');
  const heading = await page.locator('#verify-title').innerText();
  check(`${tag}: panel heading is the recommended wording`, /Verify with your Kingshot account \(recommended\)/.test(heading), heading);
  check(`${tag}: Apply without verifying link is visible`, await page.getByRole('button', { name: /Can't log in\? Apply without verifying/ }).isVisible());
  // an invalid id is caught locally
  await page.fill('#verify-player-id', '12');
  await page.getByRole('button', { name: /Open Kingshot, then send my code/ }).click();
  check(`${tag}: bad Player ID shows an error`, await page.locator('#verify-error').isVisible());
  // wrong code
  await page.fill('#verify-player-id', scenario === 'nulls' ? pid(1) : pid(0));
  await page.getByRole('button', { name: /Open Kingshot, then send my code/ }).click();
  await page.waitForSelector('#verify-code');
  await page.fill('#verify-code', '000000');
  await page.getByRole('button', { name: /Verify me/ }).click();
  await page.waitForSelector('#verify-error');
  check(`${tag}: wrong code shows an error`, /incorrect/i.test(await page.locator('#verify-error').innerText()));
  await shot('code-error');
  await page.fill('#verify-code', '123456');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.verify-panel.is-verified');
  await page.waitForTimeout(400);
  check(`${tag}: verified panel keeps focus on its heading`, await page.evaluate(() => document.activeElement?.id === 'verify-title'));
  check(`${tag}: polite live region announces`, /Verified\./.test(await page.locator('.verify-live[role=status]').innerText()));
  await panelShot('verified');
  check(`${tag}: name locked`, (await ro('f-inGameName')) && /^Mock/.test(await val('f-inGameName')));
  check(`${tag}: player id locked`, (await ro('f-playerId')) && /^12\d{7}$/.test(await val('f-playerId')));
  check(`${tag}: server locked to 523`, (await ro('f-currentServer')) && (await val('f-currentServer')) === '523');
  check(`${tag}: alliance locked`, (await ro('f-currentAlliance')) && (await val('f-currentAlliance')) === '[ABC] Alpha Crew');
  check(`${tag}: lock text present (not colour only)`, (await page.getByText('Verified by the game').count()) >= 4);
  await page.fill('#f-discordUsername', 'qa_applicant');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  // power step
  for (let i = 0; i < 1; i += 1) { await fillStep(); await page.getByRole('button', { name: /^Continue$/ }).click(); await page.waitForTimeout(300); }
  await fillStep();
  await shot('power-step');
  const powerLocked = await ro('f-totalPower');
  const mysticLocked = await ro('f-mysticTrialScore');
  if (scenario === 'verified') {
    check(`${tag}: power + mystic locked`, powerLocked && mysticLocked && (await val('f-totalPower')) === '187654321' && (await val('f-mysticTrialScore')) === '48250');
  } else {
    check(`${tag}: power + mystic NOT locked when the game has none`, !powerLocked && !mysticLocked);
    check(`${tag}: self-reported hint visible`, (await page.getByText(/could not read this from the game, so please type it/).count()) >= 2);
    await page.fill('#f-totalPower', '77,000,000');
    await page.fill('#f-mysticTrialScore', '9,999');
  }
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await walkAndSubmit();
  const done = await page.locator('main').innerText();
  check(`${tag}: submitted`, /K710-[0-9A-F]{8}/.test(done), (done.match(/K710-[0-9A-F]{8}/) || [''])[0]);
  await shot('done');
}

if (scenario === 'skip') {
  await gotoInterest();
  await page.getByRole('button', { name: /Can't log in\? Apply without verifying/ }).click();
  await page.waitForSelector('.verify-panel.is-quiet');
  await shot('skipped');
  check(`${tag}: fields editable when skipping`, !(await ro('f-inGameName')) && !(await ro('f-playerId')));
  await page.fill('#f-inGameName', 'Typed Name');
  await page.fill('#f-playerId', '8800110');
  await page.fill('#f-discordUsername', 'qa_unverified');
  await page.fill('#f-currentServer', '523');
  await page.fill('#f-currentAlliance', 'TypedAlliance');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await walkAndSubmit();
  const done = await page.locator('main').innerText();
  check(`${tag}: submitted unverified`, /K710-[0-9A-F]{8}/.test(done));
}

if (scenario === 'expired' || scenario === 'different') {
  await gotoInterest();
  await verifyWith(pid(0));
  await page.fill('#f-discordUsername', 'qa_expired');
  if (scenario === 'different') {
    await page.getByRole('button', { name: 'Use a different account' }).click();
    await page.waitForSelector('#verify-player-id');
    check(`${tag}: panel returns, fields unlocked and cleared`, !(await ro('f-inGameName')) && (await val('f-inGameName')) === '' && (await val('f-playerId')) === '');
    check(`${tag}: discord (typed) kept`, (await val('f-discordUsername')) === 'qa_expired');
    check(`${tag}: focus on the Player ID box`, await page.evaluate(() => document.activeElement?.id === 'verify-player-id'));
    await shot('different');
  } else {
    // Simulate expiry: delete the applicant cookie, then try to continue / submit.
    await ctx.clearCookies({ name: 'k710_applicant' });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForSelector('.verify-notice', { timeout: 8000 });
    check(`${tag}: gentle expiry message shown`, /ran out/.test(await page.locator('.verify-notice').innerText()));
    check(`${tag}: fields unlocked again`, !(await ro('f-inGameName')));
    await shot('expired');
    // reload: draft restore must not resurrect a verified state
    await page.reload();
    await page.waitForSelector('#verify-title');
    check(`${tag}: after reload the panel asks to verify`, await page.locator('#verify-player-id').isVisible());
  }
}

if (scenario === 'member') {
  // Member login on the same server, with an applicant session in the same browser.
  await gotoInterest();
  await verifyWith(pid(0));
  const appCookie = (await ctx.cookies()).find((c) => c.name === 'k710_applicant');
  check(`${tag}: applicant cookie set, HttpOnly, Lax`, Boolean(appCookie?.httpOnly) && appCookie.sameSite === 'Lax');
  check(`${tag}: no member cookie after applicant verification`, !(await ctx.cookies()).some((c) => c.name === 'k710_member_session'));
  for (const p of ['/tools', '/power-profile', '/forms/kvk-appointments']) {
    await page.goto(`${BASE}${p}`);
    await page.waitForTimeout(800);
    check(`${tag}: ${p} stays closed to an applicant-only browser`, new URL(page.url()).pathname.startsWith('/dashboard'), page.url().replace(BASE, ''));
  }
  const memberApi = await page.evaluate(async () => (await (await fetch('/api/session')).json()).state);
  check(`${tag}: /api/session says not signed in`, memberApi !== 'authenticated', memberApi);
  // Now sign in as a member (kingdom 710 account in the mock) through the real member screen.
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('#kingshot-player-id');
  await page.fill('#kingshot-player-id', pid(5));
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /The game is open/ }).click();
  await page.waitForSelector('#kingshot-code');
  await page.fill('#kingshot-code', '123456');
  await page.getByRole('button', { name: /Log in/ }).click();
  await page.waitForTimeout(2500);
  await shot('member-dashboard');
  const cookies = await ctx.cookies();
  check(`${tag}: member cookie issued by the member login`, cookies.some((c) => c.name === 'k710_member_session'));
  check(`${tag}: applicant cookie untouched by member login`, cookies.some((c) => c.name === 'k710_applicant'));
  await page.goto(`${BASE}/tools`);
  await page.waitForTimeout(800);
  check(`${tag}: /tools opens for the member`, new URL(page.url()).pathname.startsWith('/tools'), page.url().replace(BASE, ''));
  // /interest still sees the applicant verification, independent of the member session
  await gotoInterest();
  check(`${tag}: /interest still shows the applicant as verified`, await page.locator('.verify-panel.is-verified').isVisible());
  // Member logout must not drop the applicant cookie, and applicant logout must not drop the member cookie.
  await page.getByRole('button', { name: 'Use a different account' }).click();
  await page.waitForSelector('#verify-player-id');
  const after = await ctx.cookies();
  check(`${tag}: applicant logout keeps the member cookie`, after.some((c) => c.name === 'k710_member_session') && !after.some((c) => c.name === 'k710_applicant' && c.value));
}

if (scenario === 'admin') {
  const cacheFile = `${OUT}/admin-cookie.txt`;
  let cookie = existsSync(cacheFile) ? readFileSync(cacheFile, 'utf8') : '';
  if (!cookie) { cookie = await adminLogin(loadEnv()); writeFileSync(cacheFile, cookie); }
  const actx = await newCtx(browser, { who: 'admin', vp, easy, adminCookie: cookie });
  const apage = await actx.newPage();
  await apage.goto(`${BASE}/admin/dashboard/interest`);
  await apage.waitForSelector('table', { timeout: 20000 });
  await apage.waitForTimeout(800);
  const text = await apage.locator('main, body').first().innerText();
  check(`${tag}: Verified marker in the Inbox`, /Verified/.test(text));
  check(`${tag}: Unverified marker in the Inbox`, /Unverified/.test(text));
  check(`${tag}: Self-reported flag in the Inbox`, /Self-reported/.test(text));
  await apage.screenshot({ path: `${OUT}/iv-${tag}-inbox.png`, fullPage: true });
  await apage.locator('tbody tr').first().click();
  await apage.waitForSelector('.admin-drawer');
  await apage.screenshot({ path: `${OUT}/iv-${tag}-drawer.png`, fullPage: true });
  console.log('DRAWER', (await apage.locator('.admin-drawer').innerText()).replace(/\n+/g, ' | ').slice(0, 900));
}

console.log('CONSOLE ERRORS', consoleErrors);
console.log('FAILED REQUESTS', failedRequests);
console.log(`SUMMARY ${tag}: ${results.filter((r) => r[0]).length}/${results.length} passed`);
await browser.close();
void memberCookie;
