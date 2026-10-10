// QA journey for the 710 Lore feature (dev only). Run against a dev server whose MONGODB_URI is a LOCAL mongod
// and that uses the fake Drive (DRIVE_STORAGE_FAKE_DIR), with the mock translator for the language check:
//   QA_BASE=http://localhost:3011 node scripts/dev/qa-lore.mjs
// Writes screenshots to OUT (see qa-browse.mjs) and prints a JSON summary. Needs the ten seeded stories.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { BASE, adminLogin, makePng } from './qa-lib.mjs';
import { launch, newCtx, visit, OUT, VIEWPORTS } from './qa-browse.mjs';

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('QA runs against a local dev server only');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const FILES = path.join(OUT, 'files');
mkdirSync(FILES, { recursive: true });
writeFileSync(path.join(FILES, 'landscape.png'), makePng(1800, 1200, [92, 128, 70]));
writeFileSync(path.join(FILES, 'portrait.png'), makePng(900, 1300, [168, 92, 60]));

const cookie = await adminLogin();
const browser = await launch();

for (const vp of ['desktop', 'phone']) {
  const ctx = await newCtx(browser, { who: 'admin', vp, adminCookie: cookie });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/409/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 200)));

  // ---- admin: list, create with photo, edit, delete
  const list = await visit(page, '/admin/dashboard/lore', `lore-admin-list-${vp}`);
  check(`[${vp}] admin list renders`, list.status === 200 && !list.overflowX && list.errs.length === 0, JSON.stringify(list.errs));
  await page.getByRole('button', { name: '+ New story' }).click();
  const num = await page.getByLabel('Story number').inputValue();
  check(`[${vp}] new story number prefilled to next`, num === '11', `got ${num}`);
  await page.getByLabel('Title').fill('QA <b>story</b> title');
  await page.getByLabel('Story text').fill('She: "One"\nHe: "Two"\n\nSecond paragraph with <i>markup</i> & ampersand.');
  await page.setInputFiles('input[type=file]', path.join(FILES, 'landscape.png'));
  await page.waitForSelector('img[src*="/api/site-image/"]', { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/lore-admin-editor-${vp}.png`, fullPage: true });
  const imgSrc = await page.locator('img[src*="/api/site-image/"]').first().getAttribute('src');
  check(`[${vp}] photo uploaded and previewed`, /\/api\/site-image\/[0-9a-f-]{36}/.test(imgSrc), imgSrc);
  const savePos = await page.getByRole('button', { name: 'Create story' }).boundingBox();
  check(`[${vp}] sticky save bar inside the viewport`, savePos && savePos.y + savePos.height <= VIEWPORTS[vp].height + 1, JSON.stringify(savePos));
  await page.getByRole('button', { name: 'Create story' }).click();
  await page.getByText('Story 11 created.').waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/lore-admin-after-create-${vp}.png`, fullPage: true });
  const apiList = await (await page.request.get(`${BASE}/api/admin-lore`)).json();
  const s11 = apiList.stories.find((s) => s.number === 11);
  check(`[${vp}] saved with photo id, size and alt defaulting to title`, s11?.image_id && s11.image_width === 1400 && s11.image_height === 933 && s11.image_alt === 'QA <b>story</b> title', JSON.stringify({ w: s11?.image_width, h: s11?.image_height, alt: s11?.image_alt }));

  // public page of the new story: text safe, line breaks kept, photo served
  const pub = await visit(page, '/lore/story-11', `lore-story11-${vp}`);
  const html = await page.content();
  check(`[${vp}] story markup is shown as text, not rendered`, !(await page.locator('.lore-text b, .lore-text i, h1 b').count()) && html.includes('&lt;i&gt;markup&lt;/i&gt;') , '');
  const ws = await page.locator('.lore-text p').first().evaluate((el) => getComputedStyle(el).whiteSpace);
  check(`[${vp}] dialogue line breaks preserved (pre-line)`, ws === 'pre-line', ws);
  const og = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content || '');
  check(`[${vp}] og:image is the story photo`, /\/api\/site-image\/[0-9a-f-]{36}\?fallback=none$/.test(og), og);
  const loaded = await page.locator('.lore-photo img').evaluate((img) => img.complete && img.naturalWidth === 1400);
  check(`[${vp}] photo loads through the proxy`, loaded);
  check(`[${vp}] story page has no console or http errors`, pub.errs.length === 0 && !pub.overflowX, JSON.stringify(pub.errs));

  // edit: swap to a portrait photo, unpublish
  await page.goto(`${BASE}/admin/dashboard/lore`);
  await page.getByRole('row', { name: /QA/ }).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await page.setInputFiles('input[type=file]', path.join(FILES, 'portrait.png'));
  await page.waitForSelector('img[src*="/api/site-image/"]', { timeout: 15000 });
  await page.getByRole('switch', { name: 'Published' }).click();
  await page.getByRole('button', { name: 'Save story' }).click();
  await page.getByText('Story 11 saved.').waitFor({ timeout: 10000 });
  const hidden = await page.request.get(`${BASE}/lore/story-11`);
  check(`[${vp}] unpublished story is a 404 publicly`, hidden.status() === 404, String(hidden.status()));
  // duplicate number rejected
  await page.getByRole('button', { name: '+ New story' }).click();
  await page.getByLabel('Story number').fill('1');
  await page.getByLabel('Title').fill('dup');
  await page.getByLabel('Story text').fill('dup');
  await page.getByRole('button', { name: 'Create story' }).click();
  await page.getByText(/Story 1 already exists/).waitFor({ timeout: 8000 });
  check(`[${vp}] duplicate number is refused with a clear message`, true);
  await page.screenshot({ path: `${OUT}/lore-admin-dup-error-${vp}.png` });
  await page.getByRole('button', { name: 'Cancel' }).click();
  // publish again for the public screenshots, then delete later
  await page.getByRole('row', { name: /QA/ }).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('switch', { name: 'Published' }).click();
  await page.getByRole('button', { name: 'Save story' }).click();
  await page.getByText('Story 11 saved.').waitFor({ timeout: 10000 });

  await visit(page, '/lore', `lore-list-${vp}`);
  await visit(page, '/lore/story-3', `lore-story3-${vp}`);
  const pubPortrait = await visit(page, '/lore/story-11', `lore-story11-portrait-${vp}`);
  check(`[${vp}] portrait story page clean`, pubPortrait.errs.length === 0 && !pubPortrait.overflowX, JSON.stringify(pubPortrait.errs));

  // delete
  await page.goto(`${BASE}/admin/dashboard/lore`);
  await page.getByRole('row', { name: /QA/ }).getByRole('button', { name: 'Delete' }).click();
  await page.screenshot({ path: `${OUT}/lore-admin-confirm-${vp}.png` });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Story 11 deleted.').waitFor({ timeout: 10000 });
  const after = await (await page.request.get(`${BASE}/api/admin-lore`)).json();
  check(`[${vp}] deleted`, !after.stories.some((s) => s.number === 11));
  check(`[${vp}] admin console had no errors`, errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await ctx.close();
}

// ---- public (signed out): pages, home teaser, header + footer, keyboard focus, language
for (const vp of ['desktop', 'phone']) {
  const ctx = await newCtx(browser, { who: 'none', vp });
  const page = await ctx.newPage();
  const lore = await visit(page, '/lore', `lore-public-${vp}`);
  check(`[${vp}] /lore: 200, no errors, no horizontal scroll`, lore.status === 200 && lore.errs.length === 0 && !lore.overflowX, JSON.stringify(lore.errs));
  const order = await page.locator('.lore-story').evaluateAll((els) => els.map((e) => e.id));
  check(`[${vp}] stories oldest first`, order.join() === Array.from({ length: 10 }, (_, i) => `story-${i + 1}`).join(), order.join());
  const bodyText = await page.locator('main').innerText();
  check(`[${vp}] no hashtags or handles`, !/(^|\s)[#@]\w/.test(bodyText));
  const s7 = await page.locator('#story-7 .lore-text p').nth(1).innerText();
  check(`[${vp}] story 7 dialogue lines on separate lines`, s7.split('\n').length === 4, JSON.stringify(s7.slice(0, 120)));
  const single = await visit(page, '/lore/story-3', `lore-story3-public-${vp}`);
  check(`[${vp}] /lore/story-3 ok`, single.status === 200 && single.errs.length === 0 && !single.overflowX, JSON.stringify(single.errs));
  const hrefs = await page.locator('.lore-pager a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(`[${vp}] prev/next links`, hrefs.join() === '/lore/story-2,/lore/story-4', hrefs.join());
  const meta = await page.evaluate(() => ({ title: document.title, desc: document.querySelector('meta[name=description]')?.content, og: document.querySelector('meta[property="og:image"]')?.content || null }));
  check(`[${vp}] per-page metadata`, /Looked for Mithril/.test(meta.title) && /^Once we were mining for mithril\.\./.test(meta.desc || ''), JSON.stringify(meta));
  const nf = await page.request.get(`${BASE}/lore/story-99`);
  check(`[${vp}] unknown story is 404`, nf.status() === 404);
  const home = await visit(page, '/', `lore-home-${vp}`);
  const teaser = page.locator('.home-lore');
  check(`[${vp}] home teaser shows latest story (10)`, (await teaser.count()) === 1 && /superb healthcare of 710/i.test(await teaser.innerText()), '');
  await teaser.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await teaser.screenshot({ path: `${OUT}/lore-home-teaser-${vp}.png` });
  check(`[${vp}] home: no new errors`, home.errs.length === 0 && !home.overflowX, JSON.stringify(home.errs));

  // header + footer link, keyboard focus
  if (vp === 'desktop') {
    const footerLink = page.locator('footer a[href="/lore"]');
    check('footer has a Lore link', (await footerLink.count()) === 1, await footerLink.first().innerText());
    await page.goto(BASE + '/lore');
    await page.keyboard.press('Tab');
    const focusSeq = [];
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press('Tab');
      focusSeq.push(await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${e.tagName}:${(e.innerText || '').trim().slice(0, 18)}:${s.outlineStyle}:${s.outlineWidth}`; }));
      if (/started at/i.test(focusSeq[focusSeq.length - 1])) break;
    }
    const last = focusSeq[focusSeq.length - 1];
    check('keyboard Tab reaches the first story title link with a visible outline', /started at/i.test(last) && !/none/.test(last), last);
    await page.screenshot({ path: `${OUT}/lore-focus-${vp}.png` });
    await page.getByRole('button', { name: /^About/ }).first().hover().catch(() => {});
    await page.screenshot({ path: `${OUT}/lore-header-about-${vp}.png`, clip: { x: 0, y: 0, width: 1440, height: 420 } });
    const aboutLink = await page.locator('header a[href="/lore"]').count();
    check('header About menu has a Lore link', aboutLink >= 1, String(aboutLink));
  } else {
    await page.goto(BASE + '/lore');
    await page.getByRole('button', { name: /menu/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/lore-header-menu-${vp}.png` });
    check('phone menu has a Lore link', (await page.locator('header a[href="/lore"]').count()) >= 1);
  }
  await ctx.close();
}

// ---- translation: Spanish visitor. Story text must stay English and never be sent to the translator.
{
  const ctx = await newCtx(browser, { who: 'none', vp: 'desktop' });
  await ctx.addCookies([{ name: 'k710-language', value: 'es', domain: new URL(BASE).hostname, path: '/' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'es'); } catch {} });
  const page = await ctx.newPage();
  const sent = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/translate') && r.method() === 'POST') sent.push(r.postData() || ''); });
  await page.goto(BASE + '/lore', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/lore-es-desktop.png`, fullPage: false });
  const mainText = await page.locator('main').innerText();
  check('[es] story text stays English (no mock translation marker in main)', !/\[es /.test(mainText) && /Badlands of 716/.test(mainText) && /Tall tales of Danko/.test(mainText));
  const headerText = await page.locator('header').first().innerText();
  const footerText = await page.locator('footer').innerText();
  check('[es] header/footer still translate as normal', /Inicio|\[es /.test(headerText + footerText), (headerText + footerText).replace(/\s+/g, ' ').slice(0, 160));
  check('[es] nothing from the lore main was sent to the translator', !sent.some((b) => /Badlands|Danko|Alpaca|Stories coming/.test(b)), `${sent.length} requests`);
  await page.goto(BASE + '/lore/story-5', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('[es] story page also stays English', !/\[es /.test(await page.locator('main').innerText()) && !sent.some((b) => /Neo from Matrix|bonkers/.test(b)));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const teaserText = await page.locator('.home-lore').innerText();
  check('[es] home teaser: story title/excerpt stay English', /superb healthcare of 710/i.test(teaserText) && !sent.some((b) => /Superb Healthcare|Doctor Legend/.test(b)), teaserText.replace(/\s+/g, ' ').slice(0, 140));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log(JSON.stringify(failed, null, 2)); process.exitCode = 1; }
