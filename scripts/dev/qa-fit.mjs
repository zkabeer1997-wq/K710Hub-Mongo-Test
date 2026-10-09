// QA: at desktop widths the alliance page body (banner, strip, three panels, both rails) must fit in the first
// screen without scrolling. Read-only; run against a dev server on LOCAL data:
//   QA_BASE=http://localhost:3110 node scripts/dev/qa-fit.mjs [tag ...] [--easy]
// Prints a table (px margin between the lowest page-body edge and the bottom of the viewport; negative = overflow)
// and exits 1 when anything needs scrolling, overflows horizontally or logs a console error.
import { BASE } from './qa-lib.mjs';
import { launch } from './qa-browse.mjs';

const args = process.argv.slice(2);
const easy = args.includes('--easy');
const tags = args.filter((a) => !a.startsWith('--'));
if (!tags.length) tags.push('710', 'phl', 'red');
const VIEWPORTS = [[1280, 800], [1366, 768], [1440, 900], [1536, 864], [1920, 1080]];
// 1366x768 is best effort: it only warns instead of failing.
const BEST_EFFORT = new Set(['1366x768']);

const browser = await launch();
const rows = [];
let failed = false;
for (const [w, h] of VIEWPORTS) {
  for (const tag of tags) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    await ctx.addInitScript((e) => {
      try { localStorage.setItem('k710-language-v1', 'en'); if (e) localStorage.setItem('k710-easy-view', '1'); sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch { /* storage may be blocked */ }
    }, easy);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
    await page.goto(`${BASE}/alliances/${tag}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const bottom = (sel) => { const el = document.querySelector(sel); return el && getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect().bottom : null; };
      const cards = [...document.querySelectorAll('.al-rail > *')].filter((el) => getComputedStyle(el).display !== 'none');
      const railBottom = (side) => { const kids = [...document.querySelectorAll(`.al-rail-${side} > *`)].filter((el) => getComputedStyle(el).display !== 'none'); return kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) : null; };
      return {
        scrollY: window.scrollY, vh: window.innerHeight,
        panels: bottom('.al-panels'), left: railBottom('left'), right: railBottom('right'), railsShown: cards.length > 0,
        banner: Math.round(document.querySelector('.al-banner').getBoundingClientRect().height), photo: Boolean(document.querySelector('.al-banner[data-photo]')),
        hOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    const lowest = Math.max(m.panels ?? 0, m.left ?? 0, m.right ?? 0);
    const margin = Math.round(m.vh - lowest);
    const ok = m.scrollY === 0 && margin >= 0 && !m.hOverflow && m.railsShown && errors.length === 0;
    rows.push({ viewport: `${w}x${h}`, tag, photo: m.photo ? 'yes' : 'no', banner: m.banner, panelsBottom: Math.round(m.panels), leftBottom: m.left == null ? '-' : Math.round(m.left), rightBottom: Math.round(m.right), marginPx: margin, hOverflow: m.hOverflow ? 'YES' : 'no', errors: errors.length, result: ok ? 'fit' : BEST_EFFORT.has(`${w}x${h}`) ? 'WARN (best effort)' : 'NEEDS SCROLL' });
    if (!ok && !BEST_EFFORT.has(`${w}x${h}`) && !easy) failed = true;
    await ctx.close();
  }
}
await browser.close();
console.log(`alliance page fit check${easy ? ' (Easy view, scrolling allowed: informational)' : ''} against ${BASE}`);
console.table(rows);
process.exit(failed ? 1 : 0);
