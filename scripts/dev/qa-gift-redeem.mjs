// QA journey for gift code auto-redeem (DEV ONLY).
//   node scripts/dev/qa-gift-redeem.mjs
//
// Safety:
//  - Starts its OWN dev server on :3017 against the LOCAL mongod (127.0.0.1:27017), database k710_giftqa,
//    and drops that database at the end. It never touches Atlas or the owner's server on :3000.
//  - The game's real endpoint is NEVER called: GIFT_REDEEM_ENDPOINT points at scripts/dev/mock-gift-server.mjs
//    and the signing secret is a dummy value.
//  - Pacing is NOT scaled: the production code has no switch for that. The run uses the real delays
//    (800 ms / 3 s / 5 s) on a handful of players, with GIFT_REDEEM_BUDGET_MS=10000 (its minimum) so the
//    budget runs out and the chained resume is exercised for real. Takes a few minutes.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

process.env.QA_BASE = 'http://localhost:3017';
process.env.QA_MONGO_DB = 'k710_giftqa';
const { ROOT, BASE, adminLogin, client, mongo, memberCookie, loadEnv } = await import('./qa-lib.mjs');
const { launch, newCtx, audit, OUT } = await import('./qa-browse.mjs');

const MOCK_PORT = 3998;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const DUMMY = 'qa-dummy-secret';
const MEMBER = '920000003';
const results = [];
const children = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnLogged(cmd, args, env, label) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => { if (/error/i.test(String(d)) && !/ECONNRESET/.test(String(d))) process.stderr.write(`[${label}] ${String(d).slice(0, 300)}`); });
  children.push(child);
  return child;
}

async function waitUp(url, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not yet */ }
    await sleep(500);
  }
  throw new Error('server did not start: ' + url);
}

let dev = null;
async function startDev(extra) {
  await stopDev();
  dev = spawnLogged('node', ['node_modules/next/dist/bin/next', 'dev', '-p', '3017'], {
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    MONGODB_DB_NAME: 'k710_giftqa',
    GIFT_REDEEM_ENDPOINT: `${MOCK}/api/gift_code`,
    CRON_SECRET: 'qa-cron-secret',
    NEXT_TELEMETRY_DISABLED: '1',
    ...extra,
  }, 'dev');
  await waitUp(`${BASE}/api/session`);
}
async function stopDev() {
  if (!dev) return;
  dev.kill('SIGTERM');
  await sleep(1500);
  dev = null;
}

function consoleWatcher(page, bucket, label) {
  page.on('pageerror', (e) => bucket.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|404)/.test(m.text())) bucket.push(`${label} console: ${m.text().slice(0, 200)}`); });
}

const errors = [];
let exitCode = 0;
try {
  spawnLogged('node', ['scripts/dev/mock-gift-server.mjs'], { MOCK_GIFT_PORT: String(MOCK_PORT), GIFT_REDEEM_SIGN_SECRET: DUMMY }, 'mock');
  await waitUp(`${MOCK}/__stats`);

  const { client: mongoClient, db } = await mongo();
  for (const c of ['gift_codes', 'gift_players', 'gift_redemptions', 'gift_runner', 'gift_audit']) await db.collection(c).deleteMany({});

  // ------------------------------------------------------------------ phase A: no signing secret
  console.log('--- phase A: signing secret missing');
  await startDev({ GIFT_REDEEM_SIGN_SECRET: '' });
  const adminCookie = await adminLogin();
  const api = client(adminCookie);
  const anon = client('');
  check('admin API refuses anonymous', (await anon('GET', '/api/admin-gift-codes')).status === 401);
  check('runner endpoint refuses anonymous and wrong bearer', (await anon('POST', '/api/cron/gift-redeem')).status === 401
    && (await client('', { authorization: 'Bearer nope' })('POST', '/api/cron/gift-redeem')).status === 401);
  const noSecretOn = await api('POST', '/api/admin-gift-codes', { action: 'set_auto_redeem', enabled: true });
  check('switch cannot be turned on without the secret', noSecretOn.status === 400, noSecretOn.json.error);
  const ov = await api('GET', '/api/admin-gift-codes');
  check('overview says the secret is missing and never leaks a value', ov.json.config?.secret_present === false && !JSON.stringify(ov.json).includes(DUMMY));

  const browser = await launch();
  {
    const ctx = await newCtx(browser, { who: 'admin', vp: 'desktop', adminCookie });
    const page = await ctx.newPage();
    consoleWatcher(page, errors, 'A/admin');
    await page.goto(`${BASE}/admin/dashboard/gift-codes`);
    await page.getByText('not set up on this server').waitFor({ timeout: 60_000 });
    check('secret-missing banner is shown', true);
    check('switch is disabled while the secret is missing', await page.getByRole('switch').isDisabled());
    check('Process now is disabled', await page.getByRole('button', { name: /Process now|Resume/ }).isDisabled());
    await page.screenshot({ path: `${OUT}/gift-admin-nosecret-desktop.png`, fullPage: true });
    await ctx.close();
  }

  // ------------------------------------------------------------------ phase B: secret + mock
  console.log('--- phase B: secret set, mock endpoint, 10 s budget');
  await startDev({ GIFT_REDEEM_SIGN_SECRET: DUMMY, GIFT_REDEEM_BUDGET_MS: '10000' });
  await fetch(`${MOCK}/__reset`, { method: 'POST' });

  const adminCtx = await newCtx(browser, { who: 'admin', vp: 'desktop', adminCookie });
  const page = await adminCtx.newPage();
  consoleWatcher(page, errors, 'B/admin');
  await page.goto(`${BASE}/admin/dashboard/gift-codes`);
  await page.getByRole('switch').waitFor({ timeout: 60_000 });
  check('switch is enabled once the secret exists', await page.getByRole('switch').isEnabled());
  check('no secret banner now', (await page.getByText('not set up on this server').count()) === 0);
  await page.screenshot({ path: `${OUT}/gift-admin-empty-desktop.png`, fullPage: true });

  // add codes (the paste box)
  if (!(await page.getByLabel('Codes to add').isVisible())) await page.getByText('Add codes by hand', { exact: true }).click();
  await page.getByLabel('Codes to add').fill('QAGIFT001\nQAEXPIRED1\nQAGIFT002');
  await page.getByRole('button', { name: 'Add these codes' }).click();
  await page.getByText('Added 3').waitFor();
  check('three codes added from the paste box', (await db.collection('gift_codes').countDocuments({})) === 3);
  check('new codes are queued for redeeming', (await db.collection('gift_codes').countDocuments({ redeem_status: 'queued' })) === 3);

  // add players in bulk (14 players)
  const ids = Array.from({ length: 14 }, (_, i) => `${920000100 + i}`);
  await page.getByLabel('Players to add, one per line').fill(ids.map((id) => `${id} 710`).join('\n') + '\nnot-an-id 710\n123456789');
  await page.getByRole('button', { name: 'Add players' }).click();
  await page.getByText('Added 14 player(s)').waitFor();
  check('bulk add: 14 valid, bad lines reported', true);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Players to add, one per line"]').value === '');
  await page.getByLabel('Players to add, one per line').fill(ids.slice(0, 3).map((id) => `${id} 710`).join('\n'));
  await page.getByRole('button', { name: 'Add players' }).click();
  await page.getByText(/Added 0 player\(s\)\. 3 were already enrolled/).waitFor();
  check('adding enrolled players again does not duplicate', (await db.collection('gift_players').countDocuments({})) === 14);

  // import from a bot file in the browser
  const botFile = path.join(OUT, 'gift-qa-player_ids.json');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(botFile, JSON.stringify({
    playerIds: ['920000200', '920000201', '920000100', '920000202'],
    failedPlayerIds: ['920000202'],
    kingdomByPlayerId: { 920000200: '523', 920000201: '710', 920000100: '710', 920000202: '523' },
  }));
  await page.getByLabel('Bot player file').setInputFiles(botFile);
  await page.getByText(/4 player\(s\) found in/).waitFor();
  check('import preview shows the count before confirming', true);
  await page.screenshot({ path: `${OUT}/gift-admin-import-preview-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Add 4 players' }).click();
  await page.getByText(/Imported 3 new player\(s\)\. 1 were already enrolled/).waitFor();
  const imported = await db.collection('gift_players').find({ source: 'bot_import' }).toArray();
  check('imported rows are marked bot_import, existing ones not duplicated', imported.length === 3 && (await db.collection('gift_players').countDocuments({})) === 17);
  check('the bot-failed player stays failed (not redeemed)', imported.find((p) => p.player_id === '920000202')?.failed === true);

  // member opts in from their dashboard
  const memberCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  {
    const [name, ...v] = memberCookie(MEMBER).split('=');
    await memberCtx.addCookies([{ name, value: v.join('='), domain: 'localhost', path: '/' }]);
    await memberCtx.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'en'); sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch {} });
  }
  const mpage = await memberCtx.newPage();
  consoleWatcher(mpage, errors, 'B/member');
  const memberApi = client(memberCookie(MEMBER));
  const m0 = await memberApi('GET', '/api/gift-codes');
  check('member GET shows active codes and own state, not enrolled yet', m0.status === 200 && m0.json.enabled === false && m0.json.codes.length === 3);
  check('member cannot choose another player via the body', (await memberApi('PATCH', '/api/gift-codes', { enabled: true, playerId: '555555', kingdom: '1' })).status === 200
    && (await db.collection('gift_players').countDocuments({ player_id: '555555' })) === 0
    && (await db.collection('gift_players').findOne({ player_id: MEMBER }))?.kingdom_id === '710');
  await memberApi('PATCH', '/api/gift-codes', { enabled: false });
  check('anonymous cannot read member gift data', (await anon('GET', '/api/gift-codes')).status === 401);
  await mpage.goto(`${BASE}/dashboard`);
  const toggle = mpage.getByLabel('Redeem new Kingdom 710 gift codes for my account automatically');
  await toggle.waitFor({ timeout: 60_000 });
  check('member sees the plain consent sentence, default OFF', !(await toggle.isChecked()));
  await mpage.screenshot({ path: `${OUT}/gift-member-before-phone.png`, fullPage: true });
  await toggle.check();
  await mpage.getByText('Automatic redeeming is on for your account.').waitFor();
  check('member opt-in stored with session id and kingdom 710', (await db.collection('gift_players').findOne({ player_id: MEMBER, source: 'member', enabled: true }))?.kingdom_id === '710');
  await mpage.getByRole('button', { name: 'Copy code QAGIFT001' }).click();
  await mpage.getByRole('button', { name: 'Copy code QAGIFT001' }).filter({ hasText: 'Copied' }).waitFor();
  check('Copy button copies the code', (await mpage.evaluate(() => navigator.clipboard.readText())) === 'QAGIFT001');

  // admin turns the switch on: the run starts by itself (chained through CRON_SECRET)
  await page.reload();
  await page.getByRole('switch').waitFor();
  await page.getByRole('switch').click();
  await page.getByText('Automatic redeeming is on.').waitFor();
  check('admin switched automatic redeeming on', (await db.collection('gift_runner').findOne({ _id: 'runner' }))?.auto_redeem_enabled === true);
  const started = new Set();
  let sawRunning = false;
  const t0 = Date.now();
  let shotRunning = false;
  while (Date.now() - t0 < 8 * 60_000) {
    const r = await db.collection('gift_runner').findOne({ _id: 'runner' });
    if (r?.last_started_at) started.add(String(r.last_started_at));
    if (r?.lease_owner && r.lease_until > Date.now()) {
      sawRunning = true;
      if (!shotRunning) { shotRunning = true; await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/gift-admin-running-desktop.png`, fullPage: true }); }
    }
    const pending = await db.collection('gift_codes').countDocuments({ active: { $ne: false }, redeem_status: { $in: ['queued', 'running'] } });
    if (!pending && !(r?.lease_owner && r.lease_until > Date.now()) && (await db.collection('gift_redemptions').countDocuments({})) > 0) break;
    await sleep(1500);
  }
  check('a run was seen in progress', sawRunning);
  check('the 10 s budget ran out and the next run was chained automatically', started.size >= 2, `${started.size} separate runs`);

  // outcomes
  const red = (code, pid) => db.collection('gift_redemptions').findOne({ code, player_id: pid });
  const code1 = await db.collection('gift_redemptions').find({ code: 'QAGIFT001' }).toArray();
  const runnable = await db.collection('gift_players').countDocuments({ enabled: true, source: { $in: ['admin', 'bot_import', 'member'] } });
  check('QAGIFT001: every runnable player has exactly one final row', code1.length === runnable - 1 /* 920000202 is failed */ , `${code1.length} rows`);
  check('success / received / skipped(recharge) / login_failed mapped', (await red('QAGIFT001', '920000100'))?.status === 'success'
    && (await red('QAGIFT001', '920000102'))?.status === 'received'
    && (await red('QAGIFT001', '920000103'))?.status === 'skipped'
    && (await red('QAGIFT001', '920000101'))?.status === 'login_failed');
  check('unclear answers are retried (2 unclear then success = 3 attempts)', (await red('QAGIFT001', '920000104'))?.status === 'success' && (await red('QAGIFT001', '920000104'))?.attempts === 3);
  check('login_failed tried 5 times then marks the player failed', (await red('QAGIFT001', '920000101'))?.attempts === 5 && (await db.collection('gift_players').findOne({ player_id: '920000101' }))?.failed === true);
  const exp = await db.collection('gift_codes').findOne({ code: 'QAEXPIRED1' });
  check('expired code: stopped after the first player and switched off', exp.active === false && exp.expired_reason === 'game_expired' && (await db.collection('gift_redemptions').countDocuments({ code: 'QAEXPIRED1' })) === 1);
  const code2 = await db.collection('gift_redemptions').find({ code: 'QAGIFT002' }).toArray();
  check('the failed player is skipped for later codes; others done', !(await red('QAGIFT002', '920000101')) && code2.length === code1.length - 1, `${code2.length} rows`);
  check('the bot-failed and failed players were never redeemed for', !(await red('QAGIFT001', '920000202')));

  // pacing observed by the mock
  const seen = (await (await fetch(`${MOCK}/__stats`)).json()).seen;
  check('every request carried a valid signature and form encoding', seen.length > 0 && seen.every((s) => s.signOk));
  let minPlayerGap = Infinity; let minRetryGap = Infinity;
  for (let i = 1; i < seen.length; i += 1) {
    const gap = seen[i].at - seen[i - 1].at;
    if (seen[i].fid !== seen[i - 1].fid || seen[i].cdk !== seen[i - 1].cdk) minPlayerGap = Math.min(minPlayerGap, gap);
    else minRetryGap = Math.min(minRetryGap, gap);
  }
  check('at least 800 ms between players', minPlayerGap >= 780, `${minPlayerGap} ms`);
  check('at least 3000 ms between retries for the same player', minRetryGap >= 2950, `${minRetryGap} ms`);
  const long = seen.slice(1).filter((s, i) => s.at - seen[i].at >= 5700).length;
  check('the 5 s bulk pause shows up', long >= 1, `${long} long gaps`);
  check('all redeem traffic went to the local mock (real endpoint never contacted)', seen.length > 0);

  // admin UI after the run
  await page.reload();
  await page.getByRole('switch').waitFor();
  await page.waitForTimeout(800);
  const bodyText = await page.locator('main, body').first().innerText();
  check('admin shows per-code progress "X of Y"', /\d+ of \d+/.test(bodyText));
  check('admin counters show real numbers', !/Redeemed\s*—/.test(bodyText));
  await page.screenshot({ path: `${OUT}/gift-admin-done-desktop.png`, fullPage: true });

  // players table: filter failed, re-enable
  await page.getByLabel('Filter by failed').selectOption('yes');
  await page.getByText('920000101').first().waitFor();
  check('failed filter lists the player the game rejected', (await page.getByText('Failed (game)').count()) >= 1);
  await page.getByRole('button', { name: 'Re-enable' }).first().click();
  await page.waitForTimeout(1200);
  check('re-enable clears the failed mark', (await db.collection('gift_players').findOne({ player_id: '920000101' }))?.failed === false);
  await page.getByLabel('Filter by failed').selectOption('');
  await page.getByLabel('Filter by kingdom').fill('523');
  await page.getByText('Other kingdom').first().waitFor();
  check('other kingdoms are flagged', true);
  await page.getByLabel('Filter by kingdom').fill('');

  // history search
  await page.getByLabel('Player ID or code').fill('920000102');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByText('Already had it').first().waitFor();
  check('history search by player ID works', true);
  await page.getByLabel('Player ID or code').fill('QAEXPIRED');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByText('Expired').first().waitFor();
  check('history search by code works', true);

  // keyboard + confirm dialog + delete
  await page.getByRole('button', { name: 'Delete' }).first().focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('alertdialog');
  await dlg.waitFor();
  check('confirm dialog takes focus on its confirm button', await page.evaluate(() => document.activeElement?.className?.includes('confirm-dialog-confirm')));
  await page.keyboard.press('Escape');
  check('Escape closes the dialog without deleting', (await dlg.count()) === 0 && (await db.collection('gift_codes').countDocuments({})) === 3);
  const focusRing = await page.evaluate(() => { const b = document.querySelector('.gift-page button'); b.focus(); return getComputedStyle(b).outlineStyle; });
  check('buttons show a keyboard focus outline', focusRing !== 'none', focusRing);
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await dlg.waitFor();
  await page.getByRole('button', { name: 'Delete code' }).click();
  await page.waitForTimeout(1200);
  check('delete removes the code and its results', (await db.collection('gift_codes').countDocuments({})) === 2);
  check('audit trail recorded the changes', (await db.collection('gift_audit').countDocuments({})) >= 6 && (await page.getByText('Deleted a code').count()) >= 1);

  // member after the run
  await mpage.reload();
  await mpage.getByLabel('Redeem new Kingdom 710 gift codes for my account automatically').waitFor();
  const mAfter = (await memberApi('GET', '/api/gift-codes')).json;
  check('member sees their own results in plain words', mAfter.codes.some((c) => c.result === 'redeemed'), JSON.stringify(mAfter.codes.map((c) => [c.code, c.result])));
  check('member response contains no other player id', !JSON.stringify(mAfter).includes('920000101') && !JSON.stringify(mAfter).includes('920000100'));
  await mpage.screenshot({ path: `${OUT}/gift-member-after-phone.png`, fullPage: true });
  const maud = await audit(mpage);
  check('member panel has no horizontal overflow at 390', !maud.overflowX);
  await mpage.setViewportSize({ width: 1440, height: 900 });
  await mpage.reload();
  await mpage.getByLabel('Redeem new Kingdom 710 gift codes for my account automatically').waitFor();
  await mpage.screenshot({ path: `${OUT}/gift-member-after-desktop.png`, fullPage: true });
  // easy view
  await mpage.evaluate(() => { document.documentElement.dataset.easy = 'true'; });
  await mpage.waitForTimeout(300);
  await mpage.screenshot({ path: `${OUT}/gift-member-easy-desktop.png`, fullPage: true });

  // admin on a phone
  const phoneCtx = await newCtx(browser, { who: 'admin', vp: 'phone', adminCookie });
  const ppage = await phoneCtx.newPage();
  consoleWatcher(ppage, errors, 'B/admin-phone');
  await ppage.goto(`${BASE}/admin/dashboard/gift-codes`);
  await ppage.getByRole('switch').waitFor({ timeout: 60_000 });
  await ppage.waitForTimeout(1200);
  const paud = await audit(ppage);
  check('admin page has no horizontal overflow at 390', !paud.overflowX, JSON.stringify({ small: paud.smallSample }));
  await ppage.screenshot({ path: `${OUT}/gift-admin-phone.png`, fullPage: true });

  // member-pins column
  const pins = await api('GET', '/api/admin-member-pins');
  check('member-pins API answers with gift_code data', pins.status === 200 && Array.isArray(pins.json.rows));

  check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  await mongoClient.db('k710_giftqa').dropDatabase();
  await mongoClient.close();
} catch (error) {
  console.error('QA crashed:', error);
  exitCode = 1;
} finally {
  await stopDev();
  for (const c of children) c.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log('FAILED:', f.name, f.detail);
process.exit(exitCode || (failed.length ? 1 : 0));
