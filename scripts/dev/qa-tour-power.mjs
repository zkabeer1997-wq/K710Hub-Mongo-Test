// Dev-only: Power Profile wizard + tour (scanner and loadout board tips appear on step 2). Uses a QA member's own tour-progress row only.
import { launch, newCtx, OUT } from './qa-browse.mjs';
import { BASE, memberCookie } from './qa-lib.mjs';

const vp = process.argv[2] || 'desktop';
const memberId = process.argv[3] || '920000030';
await fetch(`${BASE}/api/tool-state/tour-progress`, { method: 'PUT', headers: { cookie: memberCookie(memberId), origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ state: { completed: {}, skipped: {} } }) });
const b = await launch();
const ctx = await newCtx(b, { who: 'member', memberId, vp });
const page = await ctx.newPage();
const bad = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) bad.push(m.text().slice(0, 160)); });
await page.goto(`${BASE}/power-profile`);
await page.waitForSelector('.k-tour-pop');
const title = () => page.locator('.k-tour-title').textContent();
const count = () => page.locator('.k-tour-count').textContent();
console.log('start:', await count(), await title());
await page.locator('[data-tour-primary]').click();
await page.waitForTimeout(600);
console.log('then:', await count(), await title(), '| hint:', (await page.locator('.k-tour-more').count()) === 1);
await page.fill('#pp-name', 'QA Tour');
await page.locator('.wizard-step:not([hidden]) .wizard-next').click();
await page.waitForTimeout(1200);
console.log('after Next: Gear & Charms ->', await count(), await title());
await page.screenshot({ path: `${OUT}/power-${vp}-step2-a.png` });
await page.locator('[data-tour-primary]').click();
await page.waitForTimeout(1200);
console.log('next tip ->', await count(), await title());
await page.screenshot({ path: `${OUT}/power-${vp}-step2-b.png` });
await page.locator('[data-tour-primary]').click();
await page.waitForTimeout(800);
console.log('next tip ->', (await page.locator('.k-tour-pop').count()) ? `${await count()} ${await title()}` : 'tour ended');
// Review step
await page.locator('.wizard-step:not([hidden]) .wizard-next').click();
await page.waitForTimeout(1200);
console.log('on review ->', (await page.locator('.k-tour-pop').count()) ? `${await count()} ${await title()}` : 'no popover');
await page.screenshot({ path: `${OUT}/power-${vp}-step3.png` });
console.log('problems:', bad.join(' | ') || 'none');
await b.close();
