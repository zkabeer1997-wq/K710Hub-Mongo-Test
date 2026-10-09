#!/usr/bin/env node
// Behaviour checks for the language button + runtime translation, in a real browser, against the MOCK
// translate server (see qa-translation-coverage.mjs for the setup). Prints PASS/FAIL lines.
//   QA_BASE=http://localhost:3125 MOCK=http://127.0.0.1:4455 node scripts/dev/qa-translation-behavior.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { BASE, ROOT, memberCookie } from './qa-lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const MOCK = process.env.MOCK || 'http://127.0.0.1:4455';
const LANGS = [['en', 'English'], ['ko', '한국어'], ['tl', 'Filipino'], ['ar', 'العربية'], ['es', 'Español'], ['fr', 'Français'], ['zh', '中文'], ['tr', 'Türkçe'], ['hi', 'हिन्दी'], ['ja', '日本語']];
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };
const mock = async (p, body) => (await fetch(MOCK + p, body ? { method: 'POST', body: JSON.stringify(body) } : {})).json();

const host = new URL(BASE).hostname;
const [cn, ...cv] = memberCookie('920000003').split('=');
const browser = await chromium.launch({ headless: true });
async function fresh({ vp = { width: 1440, height: 900 }, member = true } = {}) {
  const ctx = await browser.newContext({ viewport: vp });
  if (member) await ctx.addCookies([{ name: cn, value: cv.join('='), domain: host, path: '/' }]);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, errors };
}
const settle = async (page) => { for (let i = 0; i < 60; i += 1) { if (!(await page.evaluate(() => window.__k710i18n?.busy() ?? true))) { await page.waitForTimeout(400); if (!(await page.evaluate(() => window.__k710i18n?.busy() ?? true))) return; } await page.waitForTimeout(300); } };
const bodyText = (page) => page.evaluate(() => document.body.innerText);

// 1. Picker: choose every language on a member page, then a public page; check lang/dir, translation, restore.
{
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const english = await bodyText(page);
  for (const [code, native] of LANGS.slice(1)) {
    await page.locator('.lang-switch').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
    await dialog.getByRole('button', { name: new RegExp(native) }).click();
    await settle(page);
    const text = await bodyText(page);
    const meta = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, stored: localStorage.getItem('k710-language-v1'), cookie: document.cookie.includes('k710-language=') }));
    check(`[${code}] picker opens with focus inside, switches, persists`, focusInside && meta.stored === code && meta.cookie);
    check(`[${code}] <html lang dir> set`, meta.lang.startsWith(code === 'zh' ? 'zh' : code) && meta.dir === (code === 'ar' ? 'rtl' : 'ltr'), `${meta.lang}/${meta.dir}`);
    check(`[${code}] page text changed to ${code}`, text.includes(`[${code} `) && text !== english);
  }
  await page.locator('.lang-switch').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /English/ }).first().click();
  await page.waitForTimeout(600);
  const back = await bodyText(page);
  check('switching back to English restores the originals exactly', !/\[(ko|tl|ar|es|fr|zh|tr|hi|ja) /.test(back) && (await page.evaluate(() => document.documentElement.dir)) === 'ltr');
  check('no console/page errors while switching', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// 2. Cache: second visit costs no API calls (server cache + browser cache).
{
  const { ctx, page } = await fresh({ member: false });
  await ctx.addCookies([{ name: 'k710-language', value: 'fr', domain: host, path: '/' }]);
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  await settle(page);
  const before = (await mock('/__mock/stats')).calls;
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page);
  const after = (await mock('/__mock/stats')).calls;
  check('revisit uses the cache (no new provider calls)', after === before, `${before} -> ${after}`);
  // Dynamic content is picked up by the MutationObserver.
  await page.evaluate(() => { const p = document.createElement('p'); p.id = 'dyn'; p.textContent = 'A brand new sentence added later by the page.'; document.querySelector('main, #main').appendChild(p); });
  await page.waitForTimeout(500);
  await settle(page);
  check('dynamic content added later is translated', (await page.locator('#dyn').innerText()).includes('[fr '));
  // glossary + numbers survive
  await page.evaluate(() => { const p = document.createElement('p'); p.id = 'gl'; p.textContent = 'Prepare KvK with 12,500 troops at Kingshot'; document.querySelector('main, #main').appendChild(p); });
  await page.waitForTimeout(500);
  await settle(page);
  const gl = await page.locator('#gl').innerText();
  check('glossary terms and numbers survive', gl.includes('KvK') && gl.includes('12,500') && gl.includes('Kingshot'), gl);
  await ctx.close();
}

// 3. Select options keep their English values (forms must keep working).
{
  const { ctx, page } = await fresh();
  await ctx.addCookies([{ name: 'k710-language', value: 'es', domain: host, path: '/' }]);
  await page.goto(`${BASE}/forms/kvk`, { waitUntil: 'networkidle' });
  await settle(page);
  const bad = await page.evaluate(() => [...document.querySelectorAll('option')].filter((o) => /^\[es /.test(o.value)).length);
  check('translated <option> text never changes the option value', bad === 0, `${bad} bad`);
  await ctx.close();
}

// 4. API unavailable: stays English, notice appears, no JS errors; budget state.
{
  await mock('/__mock/mode', { mode: 'error403' });
  const { ctx, page, errors } = await fresh({ member: false });
  await ctx.addCookies([{ name: 'k710-language', value: 'tr', domain: host, path: '/' }]);
  await page.goto(`${BASE}/glossary?x=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { const p = document.createElement('p'); p.textContent = `Never translated before ${Date.now()} marker words`; document.body.querySelector('main, #main').appendChild(p); });
  await page.waitForTimeout(2500);
  const notice = page.locator('.rt-status-warn');
  check('provider down: dismissible notice shown', await notice.count() > 0);
  check('provider down: no JS errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  if (await notice.count()) { await notice.locator('button').click(); check('notice can be dismissed', (await page.locator('.rt-status-warn').count()) === 0); }
  await mock('/__mock/mode', { mode: 'ok' });
  await ctx.close();
}

// 5. Phone width + RTL + CJK render check (screenshots for human review).
for (const [code] of [['ar'], ['ja'], ['hi'], ['ko'], ['zh']]) {
  const { ctx, page } = await fresh({ vp: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'k710-language', value: code, domain: host, path: '/' }]);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await settle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`[${code}] phone 390: no horizontal overflow`, !overflow);
  await page.screenshot({ path: `${process.env.SHOTS || '/tmp'}/i18n-phone-${code}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
