/**
 * Playwright smoke + axe suite over every public route, for a logged-out
 * visitor and a logged-in member (signed cookie minted locally).
 *
 *   npm run build && npm run start -- -p 3111
 *   QA_BASE=http://localhost:3111 MEMBER_SESSION_SECRET=... npm run qa:smoke
 *
 * Asserts per route: HTTP 200, exactly one <h1>, no console errors, main
 * content visible above the fold, no horizontal scroll at 390px.
 * axe-core violations are REPORTED. With QA_AXE_STRICT=1 any color-contrast
 * violation FAILS the run (QA_AXE_STRICT=all fails on every axe violation).
 * Also at 390 and 768 wide: interactive elements under 44x44px are REPORTED;
 * primary nav / CTA / form controls under 44px FAIL.
 * QA_NO_DB=1 tolerates expected DB-less conditions (5xx /api console errors)
 * for CI where MongoDB is absent.
 * Note axe cannot evaluate text over gradients/images; scripts/qa-contrast.js
 * samples real pixels for those.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const B = process.env.QA_BASE || 'http://localhost:3111';
const SECRET = process.env.MEMBER_SESSION_SECRET || 'qa-smoke-secret';
const STRICT_AXE = process.env.QA_AXE_STRICT === '1' || process.env.QA_AXE_STRICT === 'all';
const NO_DB = process.env.QA_NO_DB === '1';
const STRICT_ALL = process.env.QA_AXE_STRICT === 'all';

const ROUTES = [
  '/', '/about', '/alliances/710', '/alliances/red', '/alliances/sky', '/events', '/guides',
  '/tools', '/forms', '/forms/swordland-showdown', '/power-profile', '/interest', '/timeline', '/gallery',
  '/glossary', '/dashboard',
  '/tools/charms', '/tools/hero-gear', '/tools/research',
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
  for (const [vw, vh] of [[1440, 900], [768, 1024], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('k710-forge-seen', '1'); localStorage.setItem('k710-language-v1', 'en'); } catch {} });
    if (cookies.length) await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (resp) => { if (resp.status() >= 400 && process.env.QA_VERBOSE) console.log(`HTTP ${resp.status()} ${resp.url()}`); });
    for (const r of ROUTES) {
      errors.length = 0;
      const tag = `[${label} ${vw}] ${r}`;
      const res = await page.goto(B + r, { waitUntil: 'networkidle' }).catch(() => null);
      ok(`${tag} 200`, res && res.status() === 200, `status ${res && res.status()}`);
      if (!res) continue;
      const h1 = await page.locator('h1').count();
      ok(`${tag} one h1`, h1 === 1, `found ${h1}`);
      const relevant = errors.filter((e) => !(NO_DB && (/status of 5\d\d|\/api\//.test(e))));
      ok(`${tag} no console errors`, relevant.length === 0, relevant.slice(0, 2).join(' | '));
      const box = await page.locator('main, #main').first().boundingBox().catch(() => null);
      ok(`${tag} main visible above fold`, !!box && box.y < vh && box.height > 50);
      if (vw <= 768) {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(`${tag} no horizontal scroll`, over <= 1, `overflow ${over}px`);
      }
      if (vw <= 768) {
        const small = await page.evaluate(() => {
          const out = [];
          const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]';
          for (const el of document.querySelectorAll(sel)) {
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (el.closest('[aria-hidden="true"], [inert]')) continue;
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;
            if (b.width >= 44 && b.height >= 44) continue;
            // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
            if (el.tagName === 'A' && cs.display === 'inline') continue;
            if (el.matches('input[type=checkbox], input[type=radio], input[type=file]') && el.closest('label')) {
              const lb = el.closest('label').getBoundingClientRect();
              if (lb.width >= 44 && lb.height >= 44) continue;
            }
            const primary = !!el.closest('.site-header, .site-nav-mobile') || el.matches('.btn-primary, .site-nav-cta, [class*=cta]') || (el.matches('input, select, textarea, button') && !!el.closest('form'));
            out.push({ primary, d: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''} "${(el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}` });
          }
          return out;
        });
        const bad = small.filter((x) => x.primary);
        if (small.length) console.log(`TAP   ${tag} ${small.length} under 44px (${bad.length} primary): ${small.slice(0, 6).map((x) => x.d).join('; ')}`);
        ok(`${tag} primary tap targets >=44px`, bad.length === 0, bad.slice(0, 3).map((x) => x.d).join('; '));
      }
      if (vw === 1440) {
        // evaluate (CDP) rather than addScriptTag: the nonce CSP blocks injected inline scripts.
        await page.evaluate(AXE_SRC);
        const v = await page.evaluate(async () => (await axe.run({ resultTypes: ['violations'] })).violations.map((x) => ({ id: x.id, n: x.nodes.length })));
        console.log(`AXE   ${tag} ${v.length ? v.map((x) => `${x.id}(${x.n})`).join(', ') : 'clean'}`);
        if (STRICT_AXE) ok(`${tag} axe color-contrast`, !v.some((x) => x.id === 'color-contrast'));
        if (STRICT_ALL) ok(`${tag} axe clean`, v.length === 0);
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
