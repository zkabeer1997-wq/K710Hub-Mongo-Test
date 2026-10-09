/**
 * Playwright keyboard/interaction checks for Phase 7 a11y work:
 *  - SiteHeader mobile menu: aria-expanded/aria-controls, Tab focus trap,
 *    Esc closes + returns focus to the trigger, backdrop click closes.
 *  - /interest and /power-profile wizards: ?step= in the URL (clamping,
 *    no deep-link past validation, Back button), focus on step heading,
 *    error summary linking to fields, local draft save/clear.
 *
 *   QA_BASE=http://localhost:3111 node scripts/qa-interactions.js
 */
const { chromium } = require('playwright');

const B = process.env.QA_BASE || 'http://localhost:3111';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

async function newPage(browser, vw = 390, vh = 844) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('k710-forge-seen', '1'); localStorage.setItem('k710-language-v1', 'en'); } catch {} });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function mobileMenu(browser) {
  const { ctx, page } = await newPage(browser);
  await page.goto(B + '/about', { waitUntil: 'networkidle' });
  const toggle = page.locator('button.site-nav-toggle');
  ok('menu: toggle closed initially', (await toggle.getAttribute('aria-expanded')) === 'false' && (await toggle.getAttribute('aria-controls')) === 'site-nav-mobile');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#site-nav-mobile');
  ok('menu: opens, aria-expanded=true', (await toggle.getAttribute('aria-expanded')) === 'true');
  ok('menu: focus moved into menu', await page.evaluate(() => !!document.activeElement.closest('#site-nav-mobile')));
  ok('menu: body scroll locked', (await page.evaluate(() => document.body.style.overflow)) === 'hidden');
  // Tab cycles within toggle + menu links only.
  const total = await page.evaluate(() => document.querySelectorAll('#site-nav-mobile a[href]').length + 1);
  let escaped = false;
  for (let i = 0; i < total * 2 + 2; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!(document.activeElement.closest('#site-nav-mobile') || document.activeElement.classList.contains('site-nav-toggle')));
    if (!inside) escaped = true;
  }
  ok('menu: Tab stays trapped', !escaped);
  await page.keyboard.press('Shift+Tab');
  ok('menu: Shift+Tab stays trapped', await page.evaluate(() => !!(document.activeElement.closest('#site-nav-mobile') || document.activeElement.classList.contains('site-nav-toggle'))));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#site-nav-mobile', { state: 'detached' });
  ok('menu: Esc closes', (await toggle.getAttribute('aria-expanded')) === 'false');
  ok('menu: focus returns to trigger', await page.evaluate(() => document.activeElement.classList.contains('site-nav-toggle')));
  ok('menu: scroll lock released', (await page.evaluate(() => document.body.style.overflow)) !== 'hidden');
  await toggle.click();
  await page.waitForSelector('#site-nav-mobile');
  await page.mouse.click(195, 800); // backdrop, below the menu content
  await page.waitForSelector('#site-nav-mobile', { state: 'detached' }).catch(() => {});
  ok('menu: backdrop click closes', (await page.locator('#site-nav-mobile').count()) === 0);
  await toggle.click();
  await page.locator('#site-nav-mobile a[href="/guides"]').click();
  await page.waitForURL('**/guides');
  ok('menu: closes on navigation', (await page.locator('#site-nav-mobile').count()) === 0);
  await ctx.close();
}

async function interestWizard(browser) {
  const { ctx, page } = await newPage(browser);
  const step = () => new URL(page.url()).searchParams.get('step');
  await page.goto(B + '/interest?step=4', { waitUntil: 'networkidle' });
  ok('interest: deep link past validation clamps to step 1', (await page.locator('#identity').count()) === 1 && step() === '1', `step=${step()}`);
  await page.goto(B + '/interest?step=abc', { waitUntil: 'networkidle' });
  ok('interest: invalid step falls back to 1', (await page.locator('#identity').count()) === 1);
  await page.goto(B + '/interest', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continue' }).click();
  const summary = page.locator('#form-error-summary');
  await summary.waitFor();
  ok('interest: error summary shown (role=alert)', (await summary.getAttribute('role')) === 'alert');
  ok('interest: summary focused', await page.evaluate(() => document.activeElement.id === 'form-error-summary'));
  ok('interest: field aria-invalid + describedby', (await page.locator('#f-inGameName').getAttribute('aria-invalid')) === 'true' && (await page.locator('#f-inGameName').getAttribute('aria-describedby')) === 'f-inGameName-error');
  await summary.locator('a').first().click();
  ok('interest: summary link focuses field', await page.evaluate(() => document.activeElement.id === 'f-inGameName'));
  const vals = { inGameName: 'QA Tester', playerId: '123', discordUsername: 'qa', currentServer: '1', currentAlliance: 'X' };
  for (const [k, v] of Object.entries(vals)) await page.fill(`#f-${k}`, v);
  await page.waitForTimeout(600);
  const draft = await page.evaluate(() => localStorage.getItem('k710-draft:interest:v1'));
  ok('interest: draft saved to localStorage', !!draft && draft.includes('QA Tester'));
  ok('interest: draft has no website/screenshots/pin', !!draft && !/screenshot|"pin"|password/i.test(draft));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('step') === '2');
  ok('interest: Next puts ?step=2 in URL', step() === '2');
  ok('interest: heading focused on step change', await page.evaluate(() => document.activeElement.classList.contains('petition-act-title')));
  ok('interest: no scroll jump past hero (heading in view)', await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }));
  await page.goBack();
  await page.waitForFunction(() => !new URLSearchParams(location.search).get('step') || new URLSearchParams(location.search).get('step') === '1');
  ok('interest: browser Back returns to step 1', (await page.locator('#identity').count()) === 1);
  await page.reload({ waitUntil: 'networkidle' });
  ok('interest: draft restored after reload', (await page.inputValue('#f-inGameName')) === 'QA Tester');
  await page.goto(B + '/interest?step=2', { waitUntil: 'networkidle' });
  ok('interest: valid deep link to step 2 allowed', (await page.locator('#intake').count()) === 1);
  await page.goto(B + '/interest?step=5', { waitUntil: 'networkidle' });
  ok('interest: step 5 deep link stops at first invalid step (2)', step() === '2', `step=${step()}`);
  await ctx.close();
}

async function profileWizard(browser) {
  const { ctx, page } = await newPage(browser);
  const crypto = require('crypto');
  const payload = Buffer.from(JSON.stringify({ memberId: 'qa-member', role: 'member', nonce: 'qa', exp: Date.now() + 3600e3 })).toString('base64url');
  const sig = crypto.createHash('sha256').update(`k710-member-v2:${payload}:${process.env.MEMBER_SESSION_SECRET || 'qa-smoke-secret'}`).digest('hex');
  await ctx.addCookies([{ name: 'k710_member_session', value: `${payload}.${sig}`, url: B }]);
  const step = () => new URL(page.url()).searchParams.get('step');
  await page.goto(B + '/power-profile?step=5', { waitUntil: 'networkidle' });
  ok('profile: deep link past validation clamps to step 1', step() === '1', `step=${step()}`);
  await page.goto(B + '/power-profile', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Next: Troop Levels/ }).click();
  const summary = page.locator('#form-error-summary');
  await summary.waitFor();
  ok('profile: error summary shown', (await summary.getAttribute('role')) === 'alert' && (await summary.locator('a').count()) === 2);
  ok('profile: summary focused', await page.evaluate(() => document.activeElement.id === 'form-error-summary'));
  ok('profile: field aria-invalid', (await page.locator('#pp-name').getAttribute('aria-invalid')) === 'true');
  await summary.locator('a').first().click();
  ok('profile: summary link focuses field', await page.evaluate(() => document.activeElement.id === 'pp-name'));
  await page.fill('#pp-name', 'QA');
  await page.fill('#pp-member_id', 'qa-member');
  await page.locator('#pp-member_id').blur();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Next: Troop Levels/ }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('step') === '2');
  ok('profile: Next puts ?step=2 in URL', step() === '2');
  ok('profile: heading focused', await page.evaluate(() => document.activeElement.tagName === 'H2'));
  await page.waitForTimeout(600);
  const draft = await page.evaluate(() => localStorage.getItem('k710-draft:power-profile:v1'));
  ok('profile: draft saved', !!draft && draft.includes('qa-member'));
  await page.goBack();
  await page.waitForFunction(() => (new URLSearchParams(location.search).get('step') || '1') === '1');
  ok('profile: Back returns to step 1', await page.locator('#pp-name').isVisible());
  await page.goto(B + '/power-profile?step=3', { waitUntil: 'networkidle' });
  ok('profile: draft restored + valid deep link to step 3', step() === '3' && (await page.locator('h2:has-text("Heroes")').isVisible()));
  await ctx.close();
}

async function memberCookie(ctx) {
  const crypto = require('crypto');
  const payload = Buffer.from(JSON.stringify({ memberId: 'qa-member', role: 'member', nonce: 'qa', exp: Date.now() + 3600e3 })).toString('base64url');
  const sig = crypto.createHash('sha256').update(`k710-member-v2:${payload}:${process.env.MEMBER_SESSION_SECRET || 'qa-smoke-secret'}`).digest('hex');
  await ctx.addCookies([{ name: 'k710_member_session', value: `${payload}.${sig}`, url: B }]);
}

// My appointment: read-only tabs; the old Apply tab URL lands on the KvK Prep & Appointments form.
async function kvkAppointments(browser) {
  const { ctx, page } = await newPage(browser, 1280, 900);
  await memberCookie(ctx);
  await page.goto(B + '/forms/kvk-appointments?tab=apply', { waitUntil: 'networkidle' });
  ok('appointments: ?tab=apply redirects to the Prep form', /\/prep-phase-backpack/.test(page.url()));
  await page.goto(B + '/forms/kvk-appointments', { waitUntil: 'networkidle' });
  ok('appointments: default tab is My appointment', (await page.locator('.appt-tabs a[aria-current=page]').innerText()) === 'My appointment');
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.waitForURL('**tab=schedule');
  ok('appointments: tabs have their own URL (?tab=schedule)', (await page.locator('.appt-tabs a[aria-current=page]').innerText()) === 'Schedule');
  await ctx.close();
}

// Language switcher: visible code, keyboard operable dialog, focus returns, 44px, mobile menu row.
async function languageSwitcher(browser) {
  const { ctx, page } = await newPage(browser, 1280, 900);
  await page.goto(B + '/about', { waitUntil: 'networkidle' });
  const sw = page.locator('.lang-switch--header');
  ok('lang: header switcher visible with code EN', (await sw.isVisible()) && (await sw.locator('.lang-switch-code').innerText()) === 'EN');
  const box = await sw.boundingBox();
  ok('lang: switcher tap target >= 44px', box.width >= 44 && box.height >= 44, `${box.width}x${box.height}`);
  ok('lang: accessible name includes language', /Language: .*Change language/.test(await sw.getAttribute('aria-label')));
  await sw.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role=dialog].k710-language-overlay');
  ok('lang: Enter opens chooser dialog', true);
  ok('lang: focus inside dialog', await page.evaluate(() => !!document.activeElement.closest('.k710-language-overlay')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.k710-language-overlay', { state: 'detached' });
  ok('lang: Escape closes dialog', true);
  await page.waitForFunction(() => document.activeElement.classList.contains('lang-switch'));
  ok('lang: focus returns to switcher', true);
  await sw.click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.waitForSelector('.k710-language-overlay', { state: 'detached' });
  ok('lang: quick-pick English applies and closes', (await sw.locator('.lang-switch-code').innerText()) === 'EN');
  await ctx.close();

  const m = await newPage(browser);
  await m.page.goto(B + '/about', { waitUntil: 'networkidle' });
  ok('lang: header button hidden on mobile (menu row instead)', !(await m.page.locator('.lang-switch--header').isVisible()));
  await m.page.locator('button.site-nav-toggle').click();
  const row = m.page.locator('#site-nav-mobile .lang-switch--mobile');
  await row.waitFor();
  const rb = await row.boundingBox();
  ok('lang: mobile menu row visible, >= 44px, shows language', rb.height >= 44 && /English/.test(await row.innerText()), `h=${rb.height}`);
  await row.click();
  await m.page.waitForSelector('[role=dialog].k710-language-overlay');
  ok('lang: mobile row opens chooser and closes the menu', (await m.page.locator('#site-nav-mobile').count()) === 0);
  await m.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM || undefined, args: ['--no-sandbox'] });
  await mobileMenu(browser);
  await interestWizard(browser);
  await profileWizard(browser);
  await kvkAppointments(browser);
  await languageSwitcher(browser);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
