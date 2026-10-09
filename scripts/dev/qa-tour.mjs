// Walkthrough QA (dev only): drives the form tours with Playwright and prints findings.
// Usage: QA_BASE=http://localhost:3108 node scripts/dev/qa-tour.mjs <scenario> [vp] [member-id]
// Scenarios: interest | members | rtl | keyboard | persistence | follow | easy | reduced
// Member scenarios use a QA member id (920000001-30). They only ever write that member's own `tour-progress` row.
import { launch, newCtx, OUT } from './qa-browse.mjs';
import { BASE, memberCookie } from './qa-lib.mjs';

const [scenario = 'interest', vpArg = 'desktop', memberArg = '920000030'] = process.argv.slice(2);
const log = (...a) => console.log(...a);
const PAGES = [
  ['prep', '/prep-phase-backpack'],
  ['avail', '/dashboard/form'],
  ['dragon', '/flamedragon'],
  ['noble', '/forms/flamedragon-tyrant/noble-advisor'],
  ['power', '/power-profile'],
  ['dash', '/dashboard'],
];
const problems = [];

function watch(page) {
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url().replace(BASE, '')}`); });
}

async function tourState(page) {
  return page.evaluate(() => {
    const pop = document.querySelector('.k-tour-pop');
    if (!pop) return null;
    const r = pop.getBoundingClientRect();
    const spot = document.querySelector('.k-tour-spot')?.getBoundingClientRect();
    const overlap = spot ? !(r.right <= spot.left || r.left >= spot.right || r.bottom <= spot.top || r.top >= spot.bottom) : false;
    return {
      count: pop.querySelector('.k-tour-count')?.textContent,
      title: pop.querySelector('.k-tour-title')?.textContent,
      pop: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) },
      spot: spot ? { top: Math.round(spot.top), left: Math.round(spot.left), w: Math.round(spot.width), h: Math.round(spot.height) } : null,
      overlap, vw: innerWidth, vh: innerHeight, side: pop.dataset.side,
      offscreen: r.left < 0 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight + 1,
      hScroll: document.documentElement.scrollWidth > innerWidth + 1,
      btnMin: Math.min(...[...pop.querySelectorAll('button')].map((b) => Math.round(Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width)))),
    };
  });
}

async function walk(page, name, { max = 12, settle = 1000 } = {}) {
  const seen = [];
  await page.waitForTimeout(settle);
  for (let i = 0; i < max; i++) {
    const s = await tourState(page);
    if (!s) break;
    seen.push(`${s.count} | ${s.title} | pop(${s.pop.left},${s.pop.top} ${s.pop.w}x${s.pop.h}) spot=${s.spot ? `${s.spot.left},${s.spot.top} ${s.spot.w}x${s.spot.h}` : 'none'} side=${s.side}${s.overlap ? ' OVERLAPS-TARGET' : ''}${s.offscreen ? ' OFFSCREEN' : ''}${s.hScroll ? ' H-SCROLL' : ''} minBtn=${s.btnMin}`);
    await page.screenshot({ path: `${OUT}/${name}-${i + 1}.png` });
    const primary = page.locator('[data-tour-primary]');
    const label = (await primary.textContent()).trim();
    await primary.click();
    await page.waitForTimeout(settle);
    if (label === 'Done' || label === 'تم') break;
  }
  return seen;
}

async function memberApi(memberId, method, body) {
  const res = await fetch(`${BASE}/api/tool-state/tour-progress`, {
    method,
    headers: { cookie: memberCookie(memberId), origin: BASE, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const browser = await launch();
try {
  if (scenario === 'interest') {
    for (const vp of ['desktop', 'phone']) {
      const ctx = await newCtx(browser, { who: 'anon', vp });
      const page = await ctx.newPage();
      watch(page);
      await page.goto(`${BASE}/interest`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.k-tour-pop', { timeout: 8000 });
      log(`[interest ${vp}] auto-started`);
      log((await walk(page, `interest-${vp}`)).join('\n'));
      log(`[interest ${vp}] flag:`, await page.evaluate(() => localStorage.getItem('k710-tour:interest:v1')));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      log(`[interest ${vp}] after reload dialogs:`, await page.locator('.k-tour-pop').count(), '| launcher:', await page.locator('[data-tour-launcher="interest"]').textContent());
      await ctx.close();
    }
  }

  if (scenario === 'members') {
    const before = await memberApi(memberArg, 'GET');
    log('tour-progress row BEFORE for', memberArg, JSON.stringify(before));
    if (process.env.RESET) log('reset ->', JSON.stringify(await memberApi(memberArg, 'PUT', { state: { completed: {}, skipped: {} } })));
    const ctx = await newCtx(browser, { who: 'member', memberId: memberArg, vp: vpArg });
    const page = await ctx.newPage();
    watch(page);
    const only = (process.env.ONLY || '').split(',').filter(Boolean);
    for (const [id, route] of PAGES.filter(([pid]) => !only.length || only.includes(pid))) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      const shown = await page.waitForSelector('.k-tour-pop', { timeout: 9000 }).then(() => true).catch(() => false);
      log(`\n[${id} ${vpArg}] ${route} auto-start: ${shown}`);
      if (!shown) { await page.screenshot({ path: `${OUT}/${id}-${vpArg}-nostart.png` }); continue; }
      log((await walk(page, `${id}-${vpArg}`)).join('\n'));
      log(`[${id}] launcher:`, await page.locator(`[data-tour-launcher="${id}"]`).textContent());
    }
    await page.waitForTimeout(800);
    log('\ntour-progress row AFTER:', JSON.stringify(await memberApi(memberArg, 'GET')));
    await ctx.close();
  }

  // Arabic: switch language in the middle of a tour (desktop), then a phone run that starts in Arabic.
  if (scenario === 'rtl') {
    await memberApi(memberArg, 'PUT', { state: { completed: {}, skipped: {} } });
    const ctx = await newCtx(browser, { who: 'member', memberId: memberArg, vp: 'desktop' });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/prep-phase-backpack`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.k-tour-pop', { timeout: 9000 });
    await page.waitForTimeout(800);
    await page.locator('[data-tour-primary]').click();
    await page.waitForTimeout(900);
    log('before switch:', (await tourState(page)).title);
    await page.locator('.site-header .lang-switch').first().click();
    await page.waitForSelector('.k710-language-option[lang="ar"]');
    log('popover hidden while the language dialog is open:', await page.evaluate(() => getComputedStyle(document.querySelector('.k-tour-pop')).visibility));
    await page.locator('.k710-language-option[lang="ar"]').click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    await page.waitForTimeout(1500);
    const s = await tourState(page);
    log('after switch (ar):', s && `${s.count} | ${s.title}`, '| dir:', await page.evaluate(() => document.documentElement.dir));
    const geo = await page.evaluate(() => {
      const pop = document.querySelector('.k-tour-pop');
      const skip = pop.querySelector('.k-tour-btn--text').getBoundingClientRect();
      const next = pop.querySelector('[data-tour-primary]').getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      return { skipOnStartSide: skip.left > next.left, popAlign: getComputedStyle(pop).textAlign, skipLeft: Math.round(skip.left), nextLeft: Math.round(next.left), popLeft: Math.round(pr.left), popRight: Math.round(pr.right) };
    });
    log('rtl geometry:', JSON.stringify(geo));
    await page.screenshot({ path: `${OUT}/rtl-desktop-switched.png` });
    log((await walk(page, 'rtl-desktop')).join('\n'));
    await ctx.close();

    await memberApi(memberArg, 'PUT', { state: { completed: {}, skipped: {} } });
    const ctx2 = await newCtx(browser, { who: 'member', memberId: memberArg, vp: 'phone' });
    await ctx2.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'ar'); } catch { /* ignore */ } });
    const page2 = await ctx2.newPage();
    watch(page2);
    await page2.goto(`${BASE}/prep-phase-backpack`, { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('.k-tour-pop', { timeout: 9000 });
    log('\n[phone ar] dir:', await page2.evaluate(() => document.documentElement.dir));
    log((await walk(page2, 'rtl-phone')).join('\n'));
    await ctx2.close();
  }

  // Keyboard only: focus lands in the dialog, Tab cycles inside it, Esc skips, focus returns, typing is never blocked.
  if (scenario === 'keyboard') {
    await memberApi(memberArg, 'PUT', { state: { completed: {}, skipped: {} } });
    const ctx = await newCtx(browser, { who: 'member', memberId: memberArg, vp: 'desktop' });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/prep-phase-backpack`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.k-tour-pop', { timeout: 9000 });
    await page.waitForTimeout(600);
    const where = () => page.evaluate(() => {
      const a = document.activeElement; const pop = document.querySelector('.k-tour-pop');
      return `${pop && pop.contains(a) ? 'IN-POPOVER' : 'outside'}:${a?.tagName}:${(a?.textContent || a?.getAttribute('aria-label') || '').trim().slice(0, 24)}`;
    });
    log('initial focus:', await where());
    await page.keyboard.press('Tab'); log('Tab 1:', await where());
    await page.keyboard.press('Tab'); log('Tab 2:', await where());
    await page.keyboard.press('Tab'); log('Tab 3:', await where());
    await page.keyboard.press('Tab'); log('Tab 4 (wraps?):', await where());
    await page.keyboard.press('Shift+Tab'); log('Shift+Tab:', await where());
    await page.locator('[data-tour-primary]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    log('after Enter on focused button, step:', (await tourState(page))?.count);
    // typing is never blocked: click into the name field while the tour is open
    const nameInput = page.locator('input[placeholder="Your in-game name"]').first();
    await nameInput.click(); await page.keyboard.type('Kbd');
    log('typed into field while tour open ->', JSON.stringify(await nameInput.inputValue()), '| tour still open:', (await page.locator('.k-tour-pop').count()) === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    log('Esc from the page (focus in field) -> tour open:', (await page.locator('.k-tour-pop').count()) === 1);
    log('row after Esc:', JSON.stringify((await memberApi(memberArg, 'GET')).json.state));
    // Replay with the keyboard, then Esc: focus returns to the launcher.
    await page.locator('[data-tour-launcher="prep"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.k-tour-pop');
    log('replay via Enter: focus', await where());
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    log('after Esc: popover gone:', (await page.locator('.k-tour-pop').count()) === 0, '| focus returned to launcher:', await page.evaluate(() => document.activeElement?.getAttribute('data-tour-launcher')));
    await ctx.close();
  }

  // Easy view and reduced motion.
  if (scenario === 'easy' || scenario === 'reduced') {
    for (const vp of ['phone', 'desktop']) {
      await memberApi(memberArg, 'PUT', { state: { completed: {}, skipped: {} } });
      const ctx = await newCtx(browser, { who: 'member', memberId: memberArg, vp, easy: scenario === 'easy' });
      const page = await ctx.newPage();
      if (scenario === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
      watch(page);
      await page.goto(`${BASE}/prep-phase-backpack`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.k-tour-pop', { timeout: 9000 });
      await page.waitForTimeout(800);
      log(`[${scenario} ${vp}]`, JSON.stringify(await page.evaluate(() => {
        const pop = document.querySelector('.k-tour-pop');
        const cs = getComputedStyle(pop);
        const body = getComputedStyle(pop.querySelector('.k-tour-body'));
        const btn = pop.querySelector('[data-tour-primary]').getBoundingClientRect();
        const spot = getComputedStyle(document.querySelector('.k-tour-spot'));
        return { easy: document.documentElement.dataset.easy || null, bodyPx: body.fontSize, btnH: Math.round(btn.height), animation: cs.animationName, spotTransition: spot.transitionDuration, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
      })));
      log((await walk(page, `${scenario}-${vp}`, { max: 3 })).join('\n'));
      await ctx.close();
    }
  }

  // Wizard following (interest): fill step 1, press Continue while the tour is open, the tour picks up the next screen.
  if (scenario === 'follow') {
    const ctx = await newCtx(browser, { who: 'anon', vp: vpArg });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/interest`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.k-tour-pop', { timeout: 9000 });
    await page.waitForTimeout(800);
    for (let i = 0; i < 3; i++) { await page.locator('[data-tour-primary]').click(); await page.waitForTimeout(500); }
    let s = await tourState(page);
    log('on the last visible tip:', s.count, '|', s.title, '| hint shown:', (await page.locator('.k-tour-more').count()) === 1, '| primary:', (await page.locator('[data-tour-primary]').textContent()).trim());
    await page.fill('#f-inGameName', 'QA Tour');
    await page.fill('#f-playerId', '123456789');
    await page.fill('#f-discordUsername', 'qatour');
    await page.fill('#f-currentServer', '512');
    await page.fill('#f-currentAlliance', 'None');
    log('form typing worked while the tour was open; values:', await page.inputValue('#f-inGameName'));
    await page.locator('.apply-bar-nav .k-btn:not(.k-btn-quiet)').click();
    await page.waitForTimeout(1200);
    s = await tourState(page);
    log('after pressing the real Continue button -> wizard step now:', await page.evaluate(() => document.querySelector('.apply-progress-label span')?.textContent), '| tour:', s && `${s.count} | ${s.title}`, '| primary:', (await page.locator('[data-tour-primary]').textContent()).trim());
    await page.screenshot({ path: `${OUT}/follow-${vpArg}-step2.png` });
    await page.locator('[data-tour-primary]').click(); await page.waitForTimeout(800);
    s = await tourState(page);
    log('next tip:', s && `${s.count} | ${s.title}`);
    // Back button of the wizard: the tour re-anchors to what is visible.
    await page.locator('.apply-bar-nav .k-btn-quiet').click(); await page.waitForTimeout(1000);
    s = await tourState(page);
    log('after wizard Back -> tour:', s && `${s.count} | ${s.title}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    log('skipped flag:', await page.evaluate(() => localStorage.getItem('k710-tour:interest:v1')));
    await ctx.close();
  }

  // Persistence: a member who completed a tour is not restarted after a reload, even with localStorage wiped (server mirror).
  if (scenario === 'persistence') {
    await memberApi(memberArg, 'PUT', { state: { completed: {}, skipped: {} } });
    const ctx = await newCtx(browser, { who: 'member', memberId: memberArg, vp: 'desktop' });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${BASE}/prep-phase-backpack`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.k-tour-pop', { timeout: 9000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    log('skipped; server row:', JSON.stringify((await memberApi(memberArg, 'GET')).json.state));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    log('reload (localStorage kept): tour restarted?', (await page.locator('.k-tour-pop').count()) > 0);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('k710-tour:')) localStorage.removeItem(k); });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    log('reload with localStorage wiped (server flag only): tour restarted?', (await page.locator('.k-tour-pop').count()) > 0, '| launcher label:', await page.locator('[data-tour-launcher="prep"]').textContent());
    // Replay button works and does not need the flags.
    await page.locator('[data-tour-launcher="prep"]').click();
    await page.waitForSelector('.k-tour-pop');
    log('replay button opens the tour: true');
    await page.keyboard.press('Escape');
    // Another member / another browser has no flag: starts once.
    const other = await newCtx(browser, { who: 'member', memberId: '920000029', vp: 'desktop' });
    const p2 = await other.newPage();
    await p2.goto(`${BASE}/prep-phase-backpack`, { waitUntil: 'domcontentloaded' });
    log('a different member (no flag) gets the tour:', await p2.waitForSelector('.k-tour-pop', { timeout: 9000 }).then(() => true).catch(() => false));
    await other.close();
    await ctx.close();
  }
} finally {
  await browser.close();
}
log('\n--- console/network problems ---');
log([...new Set(problems)].join('\n') || 'none');
