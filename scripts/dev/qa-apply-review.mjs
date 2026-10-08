// Regression check for the apply form: pressing Continue on step 5 (Screenshots)
// must land on step 6 "Check and send" and must NOT submit the petition.
// Usage: node scripts/dev/qa-apply-review.mjs [phone|desktop] [submit]
//   "submit" additionally presses "Send my application" on the review step (creates one local test row).
import { chromium } from 'playwright';
import { makePng } from './qa-lib.mjs';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const vp = process.argv[2] === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const doSubmit = process.argv.includes('submit');
const png = path.join(os.tmpdir(), 'k710-apply-review.png');
writeFileSync(png, makePng(200, 120));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: vp });
await ctx.addInitScript(() => {
  try { localStorage.setItem('k710-language-v1', 'en'); sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); localStorage.removeItem('k710:wizard:interest'); } catch { /* ignore */ }
});
const page = await ctx.newPage();
let posts = 0;
page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/interest')) posts += 1; });
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

await page.goto(`${BASE}/interest`, { waitUntil: 'networkidle' });
const fill = async (label, value) => page.getByLabel(label, { exact: false }).first().fill(value);
const click = (name) => page.getByRole('button', { name }).first().click();

await fill('In-game name', 'Test Review');
await fill('Player ID', '920000099');
await fill('Discord username', 'review-test');
await fill('Your current server', '412');
await fill('Your current alliance', 'ABC');
await click('Continue');
await page.locator('label.radio-option').first().click();
await click('Continue');
await page.locator('label.radio-option', { hasText: 'TG8' }).first().click();
await fill('Current amount of TG', '5');
await page.locator('label', { hasText: 'Infantry' }).first().click();
await fill('Mystic Trial TOTAL STAGES', '100');
await fill('Total Power', '91000000');
await click('Continue');
for (const name of ['activeCommit', 'willingSaveResources', 'participatesBattles']) await page.locator(`input[name="${name}"]`).first().check({ force: true });
await page.locator('input[name="spendingArchetype"]').first().check({ force: true });
await page.locator('input[name="mainLanguage"]').first().check({ force: true });
await click('Continue');
await page.locator('input[type=file]').setInputFiles(png);
await page.waitForFunction(() => /screenshot.* added/i.test(document.body.innerText), null, { timeout: 15000 });

if (!/Step 5 of 6/.test(await page.locator('.petition-step-count').innerText())) fail('expected to be on step 5');
await click('Continue');
await page.waitForTimeout(1200);
const counter = await page.locator('.petition-step-count').innerText();
if (!/Step 6 of 6/.test(counter)) fail(`after Continue on step 5 expected Step 6 of 6, got: ${counter}`);
if (posts !== 0) fail(`Continue on step 5 sent ${posts} POST(s) to /api/interest (it must not submit)`);
if (!(await page.getByRole('button', { name: 'Send my application' }).isVisible())) fail('"Send my application" button not visible on review step');
if (!(await page.getByText('Send this only once').isVisible())) fail('"send only once" note missing on review step');
await page.screenshot({ path: path.join(os.tmpdir(), `k710-apply-review-${vp.width}.png`), fullPage: true });

if (doSubmit) {
  await click('Send my application');
  await page.waitForTimeout(3000);
  if (posts !== 1) fail(`expected exactly 1 submit POST, saw ${posts}`);
}
console.log(process.exitCode ? 'apply review check FAILED' : `apply review check passed (${vp.width}px, POSTs: ${posts})`);
await browser.close();
