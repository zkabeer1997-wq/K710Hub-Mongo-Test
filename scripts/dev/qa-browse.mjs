// Playwright harness for QA journeys (dev only). Usage: import { launch, newCtx, visit } from './qa-browse.mjs'
import { createRequire } from 'node:module';
import { mkdirSync, appendFileSync } from 'node:fs';
import { BASE, loadEnv, memberCookie } from './qa-lib.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/amankabeer/Desktop/K710Hub-Mongo-Test/node_modules/playwright');
export const OUT = '/private/tmp/claude-501/-Users-amankabeer-Desktop-K710Hub-Mongo-Test/c1fa8b99-ea02-4628-90a4-b81f8dd217be/scratchpad/qa';
mkdirSync(OUT, { recursive: true });
export const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

export async function launch() { return chromium.launch({ headless: true }); }

export async function newCtx(browser, { who = 'member', memberId = '920000003', vp = 'phone', easy = false, adminCookie = null } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1, hasTouch: vp === 'phone', isMobile: vp === 'phone' });
  const host = new URL(BASE).hostname;
  const cookies = [];
  if (who === 'member') { const [name, ...v] = memberCookie(memberId).split('='); cookies.push({ name, value: v.join('='), domain: host, path: '/' }); }
  if (who === 'admin' && adminCookie) for (const c of adminCookie.split('; ')) { const [name, ...v] = c.split('='); cookies.push({ name, value: v.join('='), domain: host, path: '/' }); }
  if (cookies.length) await ctx.addCookies(cookies);
  await ctx.addInitScript((easyOn) => {
    try { localStorage.setItem('k710-language-v1', 'en'); if (easyOn) localStorage.setItem('k710-easy-view', '1'); else localStorage.removeItem('k710-easy-view');
      sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch {}
  }, easy);
  return ctx;
}

export async function audit(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0; };
    let minFont = 99; let minEl = '';
    const tiny = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText || !vis(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < minFont) { minFont = fs; minEl = (el.tagName + '.' + (el.className || '').toString().slice(0, 30) + ':' + el.textContent.trim().slice(0, 25)); }
      if (fs < 11) tiny.add(`${fs}px "${el.textContent.trim().slice(0, 25)}"`);
    }
    const small = [];
    for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],summary')) {
      if (!vis(el)) continue; const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 36) small.push(`${el.tagName}:${(el.innerText || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 22)}(${Math.round(r.width)}x${Math.round(r.height)})`);
    }
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
    return { minFont: +minFont.toFixed(1), minEl, tiny: [...tiny].slice(0, 6), smallTargets: small.length, smallSample: small.slice(0, 6), overflowX, h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim().slice(0, 60)) };
  });
}

export async function visit(page, path, name, { full = true, text = false, wait = 600 } = {}) {
  const errs = [];
  const onC = (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); };
  const onP = (e) => errs.push('pageerror: ' + String(e.message).slice(0, 160));
  const onR = (r) => { if (r.status() >= 400 && !/_next\/image|favicon/.test(r.url())) errs.push(`http ${r.status()} ${r.url().replace(BASE, '')}`); };
  page.on('console', onC); page.on('pageerror', onP); page.on('response', onR);
  const resp = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(wait);
  const a = await audit(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  page.off('console', onC); page.off('pageerror', onP); page.off('response', onR);
  const url = page.url().replace(BASE, '');
  const t = text ? (await page.locator('main').first().innerText().catch(() => page.locator('body').innerText())).replace(/\n{2,}/g, '\n').slice(0, 2500) : '';
  const line = { name, req: path, final: url, status: resp?.status(), ...a, errs: [...new Set(errs)].slice(0, 5) };
  appendFileSync(`${OUT}/audit.jsonl`, JSON.stringify(line) + '\n');
  return { ...line, text: t };
}
