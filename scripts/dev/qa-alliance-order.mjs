// QA: superadmin alliance order ("Order on the website"). LOCAL data only:
//   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710_alliance_order_qa npx next dev -p 3018
//   QA_BASE=http://localhost:3018 QA_MONGO_DB=k710_alliance_order_qa node scripts/dev/qa-alliance-order.mjs
// Seeds its own alliances/users in that local DB, drives Playwright, writes alliance-order-*.png, and drops the DB at the end.
import { BASE, mongo, memberCookie } from './qa-lib.mjs';
import { launch, newCtx, OUT } from './qa-browse.mjs';

if (!/localhost:3018|127\.0\.0\.1:3018/.test(BASE)) throw new Error('Run against the local :3018 dev server');
const DB = process.env.QA_MONGO_DB;
if (!DB || !/qa/.test(DB)) throw new Error('Set QA_MONGO_DB to a qa-named local database');
const { client, db } = await mongo();
const SUPER = '920000101';
const ADMIN = '920000102';
const failures = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) failures.push(name); };

async function seed(tags) {
  await db.collection('alliances').deleteMany({});
  const docs = tags.map((tag, i) => ({
    tag, name: tag === '710' ? 'Legend Of Zenzen' : tag === 'SKY' ? 'Sky Wardens' : tag === 'RED' ? 'Red Phoenix' : `${tag} Company`,
    blurb: `QA ${tag} alliance.`, recruiting_status: 'open', language: 'English', roster_size: 60, timezone_focus: 'UTC', active: true,
    // like old data: the last one has the default 0, the rest 1..n
    sort_order: tag === 'PHL' ? 0 : i + 1, bear_times_utc: ['13:00', '22:00'], scheduled_events: [], leaders: [], created_at: new Date(), updated_at: new Date(),
  }));
  await db.collection('alliances').insertMany(docs);
  await db.collection('kingshot_users').deleteMany({ player_id: { $in: [SUPER, ADMIN] } });
  await db.collection('kingshot_users').insertMany([
    { player_id: SUPER, nickname: 'QA Super', kingdom_id: 710, access_role: 'superadmin' },
    { player_id: ADMIN, nickname: 'QA Admin', kingdom_id: 710, access_role: 'admin' },
  ]);
}
const gridTags = (page) => page.$$eval('.al-grid .al-box', (els) => els.map((e) => e.getAttribute('data-band')));
const homeTags = (page) => page.$$eval('.home-v2-alliance-fragment', (els) => els.map((e) => e.getAttribute('data-band')));
const otherTags = (page) => page.$$eval('.al-rail-card a[href^="/alliances/"]', (els) => els.map((e) => e.getAttribute('href').split('/').pop().toUpperCase()));
const adminTags = (page) => page.$$eval('ol[aria-label="Active alliances in website order"] li [data-order-tag]', (els) => [...new Set(els.map((e) => e.getAttribute('data-order-tag')))]);

async function openOrder(ctx, vp) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 140)));
  await page.goto(`${BASE}/admin/dashboard/alliance-events`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Alliances' }).click();
  await page.getByRole('heading', { name: 'Order on the website' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  return { page, errs };
}

const browser = await launch();
const publicPage = async (path, vp = 'desktop') => {
  const ctx = await newCtx(browser, { who: 'none', vp });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 140)));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { ctx, page, errs };
};
const asMember = async (id, vp) => { const ctx = await newCtx(browser, { who: 'member', memberId: id, vp }); return ctx; };

try {
  // ---------- 1. four alliances, original order, then superadmin moves SKY first (mouse buttons) ----------
  await seed(['710', 'RED', 'SKY', 'PHL']);
  {
    const { ctx, page, errs } = await publicPage('/alliances');
    check('before: landing keeps today\'s order', JSON.stringify(await gridTags(page)) === JSON.stringify(['710', 'RED', 'SKY', 'PHL']), JSON.stringify(await gridTags(page)));
    await page.screenshot({ path: `${OUT}/alliance-order-1-before-landing-1440.png` });
    check('before: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  {
    const ctx = await asMember(SUPER, 'desktop');
    const { page, errs } = await openOrder(ctx, 'desktop');
    check('super: order tool lists original order', JSON.stringify(await adminTags(page)) === JSON.stringify(['710', 'RED', 'SKY', 'PHL']), JSON.stringify(await adminTags(page)));
    check('super: has Move buttons, no read-only note', (await page.getByRole('button', { name: /Move Sky Wardens to top/ }).count()) === 1 && (await page.getByText('Only a superadmin can change the order.').count()) === 0);
    await page.screenshot({ path: `${OUT}/alliance-order-2-super-before-1440.png` });
    await page.getByRole('button', { name: 'Move Sky Wardens to top' }).click();
    check('super: unsaved bar appears', (await page.getByText('Unsaved order change').count()) === 1);
    check('super: draft shows SKY first', (await adminTags(page))[0] === 'SKY');
    await page.screenshot({ path: `${OUT}/alliance-order-3-super-unsaved-1440.png` });
    // Reset puts it back
    await page.getByRole('button', { name: 'Reset' }).click();
    check('super: Reset restores original', JSON.stringify(await adminTags(page)) === JSON.stringify(['710', 'RED', 'SKY', 'PHL']) && (await page.getByText('Unsaved order change').count()) === 0);
    await page.getByRole('button', { name: 'Move Sky Wardens to top' }).click();
    await page.getByRole('button', { name: 'Save order' }).click();
    await page.getByText('Order saved.').waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    check('super: saved list SKY first', (await adminTags(page))[0] === 'SKY');
    await page.screenshot({ path: `${OUT}/alliance-order-4-super-saved-1440.png` });
    check('super: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  const rows = await db.collection('alliances').find({}).sort({ sort_order: 1 }).toArray();
  check('db: numbered 10,20,30,40 with who/when', rows.map((r) => r.tag).join() === 'SKY,710,RED,PHL' && rows.map((r) => r.sort_order).join() === '10,20,30,40' && rows.every((r) => r.order_updated_at && r.order_updated_by === 'QA Super'), rows.map((r) => `${r.tag}:${r.sort_order}`).join(' '));
  {
    const { ctx, page, errs } = await publicPage('/alliances');
    check('public: SKY first on landing grid', JSON.stringify(await gridTags(page)) === JSON.stringify(['SKY', '710', 'RED', 'PHL']), JSON.stringify(await gridTags(page)));
    await page.screenshot({ path: `${OUT}/alliance-order-5-after-landing-1440.png` });
    check('public: no console errors on landing', errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  {
    const { ctx, page } = await publicPage('/');
    check('public: SKY first in Home alliance section', (await homeTags(page))[0] === 'SKY', JSON.stringify(await homeTags(page)));
    await page.locator('.home-v2-alliance-line').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${OUT}/alliance-order-6-after-home-1440.png` });
    await ctx.close();
  }
  {
    const { ctx, page } = await publicPage('/alliances/red');
    const o = await otherTags(page);
    check('public: SKY first in "other alliances" list', o[0] === 'SKY', JSON.stringify(o));
    await page.screenshot({ path: `${OUT}/alliance-order-7-after-detail-1440.png` });
    await ctx.close();
  }
  {
    const r = await (await fetch(`${BASE}/api/bear-schedule`)).json();
    check('public: bear schedule API order', r.alliances.map((a) => a.tag).join() === 'SKY,710,RED,PHL', r.alliances.map((a) => a.tag).join());
    const t = await (await fetch(`${BASE}/api/alliance-tags`)).json();
    check('public: alliance-tags (form dropdowns) order', t.alliances.map((a) => a.tag).join() === 'SKY,710,RED,PHL');
  }
  {
    const { ctx, page, errs } = await publicPage('/alliances', 'phone');
    check('phone: SKY first', (await gridTags(page))[0] === 'SKY');
    await page.screenshot({ path: `${OUT}/alliance-order-8-after-landing-390.png`, fullPage: true });
    check('phone: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('phone: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  // ---------- 2. plain admin: read-only ----------
  {
    const ctx = await asMember(ADMIN, 'desktop');
    const { page, errs } = await openOrder(ctx, 'desktop');
    check('admin: read-only note shown', (await page.getByText('Only a superadmin can change the order.').count()) >= 1);
    check('admin: no move buttons', (await page.locator('[data-order-act]').count()) === 0);
    check('admin: sees current order', (await adminTags(page)).length === 0 && (await page.locator('ol[aria-label="Active alliances in website order"] li').count()) === 4);
    await page.screenshot({ path: `${OUT}/alliance-order-9-admin-readonly-1440.png` });
    // the API refuses too
    const res = await page.evaluate(async () => (await fetch('/api/admin-alliances/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: ['PHL', 'RED', '710', 'SKY'] }) })).status);
    check('admin: PUT order is 403', res === 403, String(res));
    const anon = await fetch(`${BASE}/api/admin-alliances/order`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: BASE }, body: '{}' });
    check('anonymous: PUT order is 401', anon.status === 401, String(anon.status));
    check('admin: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  // ---------- 3. keyboard only (6 alliances) ----------
  await seed(['710', 'RED', 'SKY', 'PHL', 'ABC', 'XYZ']);
  {
    const ctx = await asMember(SUPER, 'desktop');
    const { page } = await openOrder(ctx, 'desktop');
    await page.locator('[data-order-tag="XYZ"][data-order-act="up"]').focus();
    // XYZ up x2 with Enter, then Move to top for PHL via keyboard
    await page.keyboard.press('Enter');
    check('kbd: focus stays on the same row control after a move', await page.evaluate(() => document.activeElement?.getAttribute('data-order-tag') === 'XYZ' && document.activeElement?.getAttribute('data-order-act') === 'up'));
    await page.keyboard.press('Enter');
    check('kbd: XYZ moved up twice', JSON.stringify(await adminTags(page)) === JSON.stringify(['710', 'RED', 'SKY', 'XYZ', 'PHL', 'ABC']), JSON.stringify(await adminTags(page)));
    await page.locator('[data-order-tag="SKY"][data-order-act="top"]').focus();
    await page.keyboard.press('Space');
    await page.locator('[data-order-tag="ABC"][data-order-act="down"]').waitFor({ state: 'attached' });
    check('kbd: SKY to top', (await adminTags(page))[0] === 'SKY', JSON.stringify(await adminTags(page)));
    // Tab to Save order and press it
    await page.getByRole('button', { name: 'Save order' }).focus();
    await page.keyboard.press('Enter');
    await page.getByText('Order saved.').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${OUT}/alliance-order-10-keyboard-6-1440.png` });
    await ctx.close();
    const order = (await db.collection('alliances').find({}).sort({ sort_order: 1 }).toArray()).map((r) => r.tag).join();
    check('kbd: saved', order === 'SKY,710,RED,XYZ,PHL,ABC', order);
  }
  for (const [n, tags] of [[3, ['710', 'RED', 'SKY']], [4, ['710', 'RED', 'SKY', 'PHL']], [6, ['SKY', '710', 'RED', 'PHL', 'ABC', 'XYZ']]]) {
    await seed(tags);
    const { ctx, page } = await publicPage('/alliances');
    const dims = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, boxes: document.querySelectorAll('.al-grid .al-box').length }));
    check(`landing with ${n} alliances renders ${n} boxes`, dims.boxes === n, JSON.stringify(dims));
    console.log(`INFO ${n} alliances at 1440x900: page height ${dims.sh} vs viewport ${dims.ih}`);
    await page.screenshot({ path: `${OUT}/alliance-order-11-landing-${n}-1440.png` });
    await ctx.close();
  }
  {
    const ctx = await asMember(SUPER, 'phone');
    const { page, errs } = await openOrder(ctx, 'phone');
    await page.screenshot({ path: `${OUT}/alliance-order-12-admin-390.png`, fullPage: true });
    check('phone admin: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check('phone admin: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }
} finally {
  await browser.close();
  await db.dropDatabase();
  await client.close();
}
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
