// Interaction checks for the global admin fixes (dev only). Usage: QA_BASE=... node scripts/dev/qa-global-interact.mjs
import { readFileSync } from 'node:fs';
import { launch, OUT } from './qa-browse.mjs';

const BASE = process.env.QA_BASE || 'http://localhost:3103';
const cookie = readFileSync('/private/tmp/claude-501/qa-global-cookie.txt', 'utf8').trim();
const browser = await launch();
const host = new URL(BASE).hostname;
async function ctxFor(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies(cookie.split('; ').map((c) => { const [name, ...v] = c.split('='); return { name, value: v.join('='), domain: host, path: '/' }; }));
  await ctx.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'en'); } catch {} });
  return ctx;
}
const out = (k, v) => console.log(k.padEnd(34), v);
const ctx = await ctxFor(1030);
let page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });

// 1. KvK page: forms strip is read-only
await page.goto(`${BASE}/admin/dashboard/events/kvk`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Forms/ }).click();
await page.waitForTimeout(300);
out('strip switches', await page.locator('.ec-forms-panel .ec-switch, .ec-forms-panel input').count());
out('strip links', await page.locator('.ec-forms-panel a').evaluateAll((a) => a.map((x) => x.getAttribute('href')).filter((v, i, arr) => arr.indexOf(v) === i)));
await page.screenshot({ path: `${OUT}/gi-kvk-strip-1030.png` });

// 2. Overview deep link opens the Edit drawer
await page.goto(`${BASE}/admin/dashboard/form-gates?settings=swordland`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
out('deep link drawer', await page.getByRole('dialog').first().innerText().then((t) => t.slice(0, 60).replace(/\n/g, ' ')).catch(() => 'NONE'));
await page.keyboard.press('Escape');
out('Edit buttons', await page.getByRole('button', { name: /^Edit message/ }).count());

// 3. Keyboard: tab to the sidebar language control, Enter opens chooser
await page.goto(`${BASE}/admin/dashboard/overview`, { waitUntil: 'networkidle' });
await page.locator('.admin-sidebar-lang').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
out('language chooser dialog', await page.getByRole('dialog').count());
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
out('focus returns to', await page.evaluate(() => document.activeElement?.className?.toString().slice(0, 40)));

// 4. Heroes and gallery: list first, + Add opens the form
await page.goto(`${BASE}/admin/dashboard/heroes`, { waitUntil: 'networkidle' });
out('heroes add form hidden', await page.locator('#hero-add-panel').count());
await page.getByRole('button', { name: '+ Add hero' }).click();
out('heroes add form shown', await page.locator('#hero-add-panel').count());
out('heroes saved-count text', await page.locator('p', { hasText: 'across all cycles' }).first().innerText().catch(() => 'none'));
await page.goto(`${BASE}/admin/dashboard/gallery`, { waitUntil: 'networkidle' });
out('gallery add form hidden', await page.locator('#gallery-add-panel').count());
await page.getByRole('button', { name: '+ Add image' }).click();
out('gallery add form shown', await page.locator('#gallery-add-panel').count());

// 5. Gift codes: Check now primary, Force check in the menu
await page.goto(`${BASE}/admin/dashboard/gift-codes`, { waitUntil: 'networkidle' });
out('Check now visible', await page.getByRole('button', { name: 'Check now' }).count());
out('Force check hidden before menu', await page.getByRole('button', { name: 'Force check' }).isVisible());
await page.locator('details.roster-more summary').click();
out('Force check in menu', await page.getByRole('button', { name: 'Force check' }).isVisible());

// 6. Calendar: KvK bar opens the KvK admin page; count after load
await page.goto(`${BASE}/admin/dashboard/alliance-events`, { waitUntil: 'networkidle' });
const bar = page.locator('.evcal-span').first();
out('span bars', await page.locator('.evcal-span').count());
await bar.click();
await page.waitForURL(/events\/kvk/, { timeout: 8000 }).catch(() => {});
out('KvK bar navigates to', page.url().replace(BASE, ''));

// 7. Phone: Forms & copy and Pack editing
const phone = await (await ctxFor(390)).newPage();
await phone.goto(`${BASE}/admin/dashboard/form-gates`, { waitUntil: 'networkidle' });
await phone.screenshot({ path: `${OUT}/gi-formgates-390.png` });
await phone.goto(`${BASE}/admin/dashboard/tool-editing`, { waitUntil: 'networkidle' });
await phone.screenshot({ path: `${OUT}/gi-tool-390.png` });
out('console errors', JSON.stringify([...new Set(errors)]));
await browser.close();
