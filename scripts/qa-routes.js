/**
 * Route-level regression suite for the kingdom world redesign.
 *
 * Boots nothing itself — point it at a running production build:
 *   npm run build && npm run start -- -p 3111
 *   QA_BASE=http://localhost:3111 node scripts/qa-routes.js
 *
 * It asserts the things a redesign is most likely to break silently:
 * route status, heading structure, the production field counts on every
 * form, server-side admin gating, the PIN gate, and horizontal overflow
 * at six widths.
 */
const { chromium } = require('playwright');
const B = process.env.QA_BASE || 'http://localhost:3111';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.QA_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));

  // 1. route status
  const routes = ['/', '/interest', '/dashboard', '/dashboard/form', '/power-profile', '/prep-phase-backpack', '/flamedragon', '/admin/login'];
  for (const r of routes) {
    const res = await p.goto(B + r, { waitUntil: 'domcontentloaded' });
    ok(`route ${r} 200`, res.status() === 200, `status ${res.status()}`);
  }

  // 2. exactly one h1 per public route
  for (const r of ['/', '/interest', '/dashboard', '/dashboard/form', '/power-profile', '/prep-phase-backpack', '/flamedragon']) {
    await p.goto(B + r, { waitUntil: 'networkidle' });
    const n = await p.locator('h1').count();
    ok(`single h1 on ${r}`, n === 1, `found ${n}`);
  }

  // 3. field-count contracts (production data must survive the redesign)
  await p.goto(B + '/interest', { waitUntil: 'networkidle' });
  const interestControls = await p.locator('form input, form select, form textarea').count();
  ok('interest form control count >= 51', interestControls >= 51, `${interestControls}`);
  ok('interest screenshot upload present', await p.locator('input[type=file]').count() > 0);

  await p.goto(B + '/power-profile', { waitUntil: 'networkidle' });
  const selects = await p.locator('form select').count();
  ok('power-profile gear+charm selects = 24', selects === 24, `${selects}`);
  const pwInputs = await p.locator('form input').count();
  ok('power-profile text inputs (name, id, pet, masters, pin) = 5', pwInputs === 5, `${pwInputs}`);

  await p.goto(B + '/prep-phase-backpack', { waitUntil: 'networkidle' });
  const slots = await p.locator('.prep-slot').count();
  ok('prep backpack time slots = 192', slots === 192, `${slots}`);

  await p.goto(B + '/flamedragon', { waitUntil: 'networkidle' });
  ok('flamedragon form present', await p.locator('form').count() > 0);

  // 4. server-side admin gating
  const dash = await p.goto(B + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
  ok('admin dashboard redirects unauthenticated to /admin/login', p.url().endsWith('/admin/login'), p.url());
  ok('no dashboard markup leaked to anonymous', (await p.locator('.admin-shell').count()) === 0);
  await p.goto(B + '/admin/login', { waitUntil: 'networkidle' });
  ok('admin login has password field', await p.locator('input[type=password]').count() === 1);

  // 5. PIN gate on member path
  await p.goto(B + '/dashboard', { waitUntil: 'networkidle' });
  ok('dashboard shows PIN gate, not hall', await p.locator('input[type=password]').count() >= 1 && await p.locator('.hall-station').count() === 0);

  // 7. gate roads navigate
  await p.goto(B + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(4200);
  const roads = await p.locator('.gate-road').count();
  ok('gate shows two roads', roads === 2, `${roads}`);

  // 8. no console/page errors
  ok('no uncaught page errors', errs.length === 0, errs.join(' | '));

  // 9. horizontal overflow across widths
  const widths = [1920, 1440, 1024, 768, 430, 390];
  for (const w of widths) {
    const pg = await b.newPage({ viewport: { width: w, height: 900 } });
    let worst = null;
    for (const r of ['/', '/interest', '/dashboard', '/power-profile', '/prep-phase-backpack', '/flamedragon', '/admin/login']) {
      await pg.goto(B + r, { waitUntil: 'networkidle' });
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 1 && (!worst || ov > worst.ov)) worst = { r, ov };
    }
    ok(`no horizontal overflow @${w}`, !worst, worst ? `${worst.r} overflows ${worst.ov}px` : '');
    await pg.close();
  }

  // 10. reduced motion: forge does not block
  const rm = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const t0 = Date.now();
  await rm.goto(B + '/', { waitUntil: 'networkidle' });
  await rm.waitForSelector('.gate-road', { timeout: 6000 }).catch(() => {});
  ok('reduced motion reaches the gate quickly', Date.now() - t0 < 6000, `${Date.now() - t0}ms`);
  await rm.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
