#!/usr/bin/env node
// Crawl-based translation COVERAGE test (dev only). With the MOCK translate server behind the dev
// server, visits every public + member route in every non-English language and reports visible text
// that is still the English original.
//
//   node scripts/dev/mock-translate-server.mjs --port 4455 &
//   GOOGLE_TRANSLATE_ENDPOINT=http://127.0.0.1:4455/language/translate/v2 GOOGLE_TRANSLATE_API_KEY=mock \
//     node_modules/.bin/next dev -p 3125 &
//   QA_BASE=http://localhost:3125 node scripts/dev/qa-translation-coverage.mjs [--lang es,ar] [--route /guides] [--max 40] [--json out.json]
//
// How "still English" is decided, independently of the overlay's own filters: the page is loaded in
// English first and every visible text node / placeholder / title / aria-label / alt is recorded; in
// the translated load, any node whose text is still one of those English strings (and that is real
// prose: not a number, date, id, code, brand or glossary term) is reported.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ROOT, memberCookie } from './qa-lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const LANGS = ['ko', 'tl', 'ar', 'es', 'fr', 'zh', 'tr', 'hi', 'ja'];

export const PUBLIC_ROUTES = ['/', '/about', '/timeline', '/events', '/guides', '/alliances', '/gallery', '/glossary', '/help', '/interest', '/interest/status', '/login', '/gate', '/dashboard', '/tools'];
export const MEMBER_ROUTES = ['/dashboard', '/forms', '/forms/kvk', '/forms/kvk-appointments', '/forms/flamedragon-tyrant', '/forms/flamedragon-tyrant/noble-advisor', '/forms/flamedragon-tyrant/my-appointment', '/forms/requests', '/power-profile', '/prep-phase-backpack', '/flamedragon', '/dashboard/form', '/tools/pet-pack-optimizer', '/tools/masters-pack-optimizer', '/tools/account-progression', '/tools/charms', '/tools/governor-gear', '/tools/hero-gear', '/tools/research', '/tools/construction', '/tools/adventure-stall', '/tools/pets', '/tools/masters'];

function parseArgs(argv) {
  const a = { langs: LANGS, routes: null, max: 25, json: null, wait: 25000, member: '920000003' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--lang') a.langs = argv[(i += 1)].split(',');
    else if (argv[i] === '--route') a.routes = argv[(i += 1)].split(',');
    else if (argv[i] === '--max') a.max = Number(argv[(i += 1)]);
    else if (argv[i] === '--json') a.json = argv[(i += 1)];
    else if (argv[i] === '--wait') a.wait = Number(argv[(i += 1)]);
    else if (argv[i] === '--member') a.member = argv[(i += 1)];
  }
  return a;
}

/** Everything visible on the page that carries English prose. Runs in the browser. */
function snapshotInPage() {
  const SKIP = 'script,style,noscript,code,pre,textarea,svg,canvas,iframe,template,head,[data-no-translate],[data-k710-no-translate],.notranslate,[translate="no"],[contenteditable="true"]';
  const out = [];
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0 || cs.position === 'fixed';
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.data.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (text && el && !el.closest(SKIP) && visible(el) && !el.closest('.rt-status-wrap')) out.push({ kind: 'text', applied: !!(window.__k710i18n && window.__k710i18n.isApplied(node)), text, where: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') });
    node = walker.nextNode();
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],img[alt]')) {
    if (el.closest(SKIP) || el.closest('.rt-status-wrap')) continue;
    for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
      const v = el.getAttribute(attr);
      if (v && v.trim()) out.push({ kind: attr, applied: !!(window.__k710i18n && window.__k710i18n.isApplied_attr(el, attr)), text: v.replace(/\s+/g, ' ').trim(), where: el.tagName.toLowerCase() });
    }
  }
  return out;
}

async function settle(page, timeout) {
  const start = Date.now();
  let quiet = 0;
  while (Date.now() - start < timeout) {
    const busy = await page.evaluate(() => (window.__k710i18n ? window.__k710i18n.busy() : true)).catch(() => true);
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= 3) return true;
    await page.waitForTimeout(350);
  }
  return false;
}

async function discoverRoutes(browser, cookie) {
  const ctx = await browser.newContext();
  if (cookie) await ctx.addCookies([cookie]);
  const page = await ctx.newPage();
  const found = new Set();
  for (const hub of ['/guides', '/events', '/alliances', '/forms']) {
    await page.goto(BASE + hub, { waitUntil: 'networkidle' }).catch(() => {});
    const links = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')));
    for (const href of links) {
      const clean = href.split('#')[0].split('?')[0];
      if (new RegExp(`^${hub}/[^/]+$`).test(clean) && !clean.includes('.')) found.add(clean);
    }
  }
  await ctx.close();
  return [...found];
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = new URL(BASE).hostname;
  const [cn, ...cv] = memberCookie(args.member).split('=');
  const member = { name: cn, value: cv.join('='), domain: host, path: '/' };
  const browser = await chromium.launch({ headless: true });
  const routeList = args.routes || [...new Set([...PUBLIC_ROUTES, ...MEMBER_ROUTES, ...(await discoverRoutes(browser, member)).slice(0, 14)])];
  const glossary = JSON.parse(readFileSync(path.join(ROOT, 'i18n/glossary.json'), 'utf8'));
  void glossary;
  const report = { base: BASE, routes: routeList.length, langs: args.langs, pages: [], totals: {} };

  for (const route of routeList) {
    // 1. English baseline
    const baseCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await baseCtx.addCookies([member]);
    await baseCtx.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'en'); sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch { /* */ } });
    const basePage = await baseCtx.newPage();
    const resp = await basePage.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await basePage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await basePage.waitForTimeout(700);
    const finalPath = new URL(basePage.url()).pathname;
    const english = await basePage.evaluate(snapshotInPage);
    const prose = await basePage.evaluate((items) => items.filter((i) => window.__k710i18n?.isTranslatable(i.text)).map((i) => i.text), english).catch(() => english.map((i) => i.text));
    const englishSet = new Set(prose);
    await baseCtx.close();
    if (!resp || resp.status() >= 400) { report.pages.push({ route, finalPath, status: resp?.status() ?? 0, skipped: true }); console.log(`${route}: HTTP ${resp?.status()} (skipped)`); continue; }

    for (const lang of args.langs) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addCookies([member, { name: 'k710-language', value: lang, domain: host, path: '/' }]);
      await ctx.addInitScript((l) => { try { localStorage.setItem('k710-language-v1', l); sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch { /* */ } }, lang);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 140)}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 140)}`); });
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const settled = await settle(page, args.wait);
      await page.waitForTimeout(400);
      const snap = await page.evaluate(snapshotInPage);
      const translatable = await page.evaluate((items) => items.map((i) => !!window.__k710i18n?.isTranslatable(i.text)), snap);
      const still = snap.filter((item, i) => translatable[i] && !item.applied && englishSet.has(item.text));
      const stats = await page.evaluate(() => window.__k710i18n?.stats() || { nodes: 0, attrs: 0 });
      const meta = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title }));
      const total = snap.filter((_, i) => translatable[i]).length;
      const row = {
        route, finalPath, lang, settled, translatedNodes: stats.nodes, translatedAttrs: stats.attrs, proseNodes: total, stillEnglish: still.length,
        coverage: total ? +(((total - still.length) / total) * 100).toFixed(1) : 100, htmlLang: meta.lang, dir: meta.dir, errors: [...new Set(errors)].slice(0, 3),
        sample: [...new Set(still.map((s) => `${s.kind}:${s.text.slice(0, 70)}`))].slice(0, args.max),
      };
      report.pages.push(row);
      console.log(`${route} [${lang}] ${row.coverage}% (${row.translatedNodes} nodes, ${row.stillEnglish} English left${settled ? '' : ', NOT SETTLED'}${errors.length ? `, ${errors.length} errors` : ''})`);
      await ctx.close();
    }
  }
  await browser.close();

  for (const lang of args.langs) {
    const rows = report.pages.filter((p) => p.lang === lang);
    const total = rows.reduce((n, r) => n + r.proseNodes, 0);
    const left = rows.reduce((n, r) => n + r.stillEnglish, 0);
    report.totals[lang] = { pages: rows.length, proseNodes: total, stillEnglish: left, coverage: total ? +(((total - left) / total) * 100).toFixed(2) : 100, pageErrors: rows.filter((r) => r.errors.length).length };
  }
  console.log('\nPer language:');
  for (const [lang, t] of Object.entries(report.totals)) console.log(`  ${lang}: ${t.coverage}% (${t.stillEnglish} of ${t.proseNodes} prose nodes still English across ${t.pages} pages, ${t.pageErrors} pages with errors)`);
  const worst = report.pages.filter((p) => p.stillEnglish).sort((a, b) => b.stillEnglish - a.stillEnglish).slice(0, 12);
  if (worst.length) {
    console.log('\nLargest remainders:');
    for (const w of worst) console.log(`  ${w.route} [${w.lang}] ${w.stillEnglish}: ${w.sample.slice(0, 4).join(' | ')}`);
  }
  if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 1));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
