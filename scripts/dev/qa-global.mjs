// QA for the global admin fixes (dev only): visits admin pages at several widths,
// reports console errors, sideways-scrolling tables and the floating language button.
// Usage: QA_BASE=http://localhost:3103 node scripts/dev/qa-global.mjs [width] [path...]
import { readFileSync } from 'node:fs';
import { launch, OUT } from './qa-browse.mjs';

const BASE = process.env.QA_BASE || 'http://localhost:3103';
const cookie = readFileSync('/private/tmp/claude-501/qa-global-cookie.txt', 'utf8').trim();
const width = Number(process.argv[2] || 1030);
const PAGES = process.argv.slice(3).length ? process.argv.slice(3) : [
  'overview', 'events/kvk', 'events/flamedragon', 'alliance-events', 'member-pins', 'interest', 'access', 'gift-codes',
  'guides', 'gallery', 'heroes', 'help-images', 'page-text', 'tool-editing', 'tool-database', 'tool-images',
  'form-gates', 'integrations', 'page-addresses',
];

const browser = await launch();
const host = new URL(BASE).hostname;
const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
await ctx.addCookies(cookie.split('; ').map((c) => { const [name, ...v] = c.split('='); return { name, value: v.join('='), domain: host, path: '/' }; }));
await ctx.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'en'); } catch {} });
for (const p of PAGES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 140)));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('_next')) errors.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  await page.goto(`${BASE}/admin/dashboard/${p}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent;
    const wraps = [...document.querySelectorAll('.admin-table-wrap, .ui-table-scroll, table')].filter((w) => w.scrollWidth > w.clientWidth + 2 && w.tagName !== 'TABLE').map((w) => `${w.className.toString().slice(0, 30)} ${w.scrollWidth}>${w.clientWidth}`);
    const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    const globe = document.querySelector('.k710-language-globe');
    const globeShown = globe ? getComputedStyle(globe).display !== 'none' : false;
    const active = document.querySelector('.admin-sidebar-nav a.active .admin-nav-link-label')?.textContent;
    return { h1, wraps, docOverflow, globeShown, active };
  });
  console.log(p.padEnd(20), JSON.stringify(info), errors.length ? 'ERR ' + JSON.stringify([...new Set(errors)].slice(0, 4)) : '');
  await page.screenshot({ path: `${OUT}/g-${p.replace(/\W/g, '_')}-${width}.png` });
  await page.close();
}
await browser.close();
