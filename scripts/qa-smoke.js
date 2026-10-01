/**
 * Playwright smoke + axe suite over every public route, for a logged-out
 * visitor and a logged-in member (signed cookie minted locally).
 *
 *   npm run build && npm run start -- -p 3111
 *   QA_BASE=http://localhost:3111 MEMBER_SESSION_SECRET=... npm run qa:smoke
 *
 * Asserts per route: HTTP 200, exactly one <h1>, no console errors, main
 * content visible above the fold, no horizontal scroll at 390px.
 * axe-core violations are REPORTED, not failing (set QA_AXE_STRICT=1 to fail).
 */
const { chromium } = require('playwright');
const path = require('path');

const B = process.env.QA_BASE || 'http://localhost:3111';
const SECRET = process.env.MEMBER_SESSION_SECRET || 'qa-smoke-secret';
const STRICT_AXE = process.env.QA_AXE_STRICT === '1';

const ROUTES = [
  '/', '/about', '/alliances/710', '/alliances/red', '/alliances/sky', '/events', '/guides',
  '/tools', '/forms', '/power-profile', '/interest', '/chronometer', '/timeline', '/gallery',
  '/glossary', '/player-record',
];

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

async function memberCookie() {
  const crypto = require('crypto');
  const b64 = (s) => Buffer.from(s).toString('base64url');
  const payload = b64(JSON.stringify({ memberId: 'qa-member', role: 'member', nonce: 'qa', exp: Date.now() + 3600e3 }));
  const sig = crypto.createHash('sha256').update(`k710-member-v2:${payload}:${SECRET}`).digest('hex');
  return { name: 'k710_member_session', value: `${payload}.${sig}`, url: B };
}

async function run(browser, label, cookies) {
  for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('k710-forge-seen', '1'); localStorage.setItem('k710-language-v1', 'en'); } catch {} });
    if (cookies.length) await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    for (const r of ROUTES) {
      errors.length = 0;
      const tag = `[${label} ${vw}] ${r}`;
      const res = await page.goto(B + r, { waitUntil: 'networkidle' }).catch(() => null);
      ok(`${tag} 200`, res && res.status() === 200, `status ${res && res.status()}`);
      if (!res) continue;
      const h1 = await page.locator('h1').count();
      ok(`${tag} one h1`, h1 === 1, `found ${h1}`);
      ok(`${tag} no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      const box = await page.locator('main, #main').first().boundingBox().catch(() => null);
      ok(`${tag} main visible above fold`, !!box && box.y < vh && box.height > 50);
      if (vw === 390) {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(`${tag} no horizontal scroll`, over <= 1, `overflow ${over}px`);
      }
      if (vw === 1440) {
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
        const v = await page.evaluate(async () => (await axe.run({ resultTypes: ['violations'] })).violations.map((x) => `${x.id}(${x.nodes.length})`));
        console.log(`AXE   ${tag} ${v.length ? v.join(', ') : 'clean'}`);
        if (STRICT_AXE) ok(`${tag} axe clean`, v.length === 0);
      }
    }
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM || undefined, args: ['--no-sandbox'] });
  await run(browser, 'visitor', []);
  await run(browser, 'member', [await memberCookie()]);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
