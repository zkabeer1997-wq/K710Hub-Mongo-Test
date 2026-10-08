import { launch, newCtx, OUT } from './qa-browse.mjs';
import { makePng } from './qa-lib.mjs';
import { writeFileSync } from 'node:fs';
const vp = process.argv[2] || 'phone';
writeFileSync('/tmp/qa-shot.png', makePng(200, 120));
const browser = await launch();
const ctx = await newCtx(browser, { who: 'none', vp });
const page = await ctx.newPage();
const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 120)));
await page.goto('http://localhost:3000/interest'); await page.waitForTimeout(4500);
const main = async () => (await page.locator('main').innerText()).replace(/\n+/g, ' | ');
for (let step = 1; step <= 9; step++) {
  const heading = (await page.locator('main').innerText()).match(/Step \d of \d[^\n]*|Step \d · [^\n]*/g);
  console.log('STEP', step, heading?.slice(0, 2));
  // fill
  for (const el of await page.locator('main input:visible, main select:visible, main textarea:visible').all()) {
    const type = await el.getAttribute('type'); const name = (await el.getAttribute('name')) || '';
    const label = (await el.evaluate((e) => (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || '')))
    try {
      if (name === 'website' || /leave this field/i.test(label)) continue;
      if (type === 'file') { await el.setInputFiles('/tmp/qa-shot.png'); continue; }
      if (type === 'radio' || type === 'checkbox') continue;
      if (el.evaluate((e) => e.tagName) && (await el.evaluate((e) => e.tagName)) === 'SELECT') { await el.selectOption({ index: 1 }); continue; }
      if (await el.evaluate((e) => e.value)) continue;
      const l = (name + label).toLowerCase();
      const v = /discord/.test(l) ? 'testuser28' : /player|id/.test(l) ? '920000028' : /name/.test(l) ? 'Test Brynn' : /server/.test(l) ? '412' : /power|tg|stage|pass|troop/.test(l) ? '91000000' : /alliance/.test(l) ? 'ABC' : '5';
      await el.fill(v);
    } catch (e) { }
  }
  const groups = await page.locator('main [role=radiogroup]:visible').all();
  for (const g of groups) await g.locator('label').first().click({ force: true }).catch(() => {});
  if (!groups.length) for (const r of await page.locator('main input[type=radio]:visible').all()) await r.check({ force: true }).catch(() => {});
  const cbs = page.locator('main input[type=checkbox]:visible'); if (await cbs.count()) await cbs.first().check({ force: true }).catch(() => {});
  await page.screenshot({ path: `${OUT}/apply-${vp}-step${step}.png`, fullPage: true });
  const submit = page.locator('main button[type=submit]');
  if (await submit.count()) { console.log('REVIEW TEXT', (await main()).slice(0, 1500)); break; }
  const next = page.getByRole('button', { name: /continue|next/i }).first();
  await next.click({ force: true }); await page.waitForTimeout(700);
  if (step >= 5) { console.log('AFTER CONTINUE', step, page.url(), (await main()).slice(0, 700)); await page.screenshot({ path: `${OUT}/apply-${vp}-after${step}.png`, fullPage: true }); }
  const err = await page.locator('[role=alert], .field-error, .error').allInnerTexts();
  if (err.length) console.log(' ERR', err.slice(0, 4));
}
await page.screenshot({ path: `${OUT}/apply-${vp}-review.png`, fullPage: true });
if (process.argv[3] === 'submit') {
  await page.locator('main button[type=submit]').first().click({ force: true });
  await page.waitForTimeout(2500);
  console.log('AFTER SUBMIT', (await main()).slice(0, 900));
  await page.screenshot({ path: `${OUT}/apply-${vp}-done.png`, fullPage: true });
}
console.log('console errors', errs);
await browser.close();
