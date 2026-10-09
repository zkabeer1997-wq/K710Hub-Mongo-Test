import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ADMIN_NAV, isNavActive, visibleNav } from '../components/admin/adminNav.js';
import { FORM_GROUPS, FORM_GATE_KEYS, KVK_FORM_KEYS, FLAMEDRAGON_FORM_KEYS, VOTE_FORM_KEYS } from '../lib/formGates.mjs';
import {
  driveBannerVisible, driveHealth, giftCodeHealth, needsPromotionConfirm, rankAttention, sortPeriodsNewestFirst, startsInText,
} from '../lib/adminOverview.mjs';
import { HOUR, spanBarsForWeek } from '../lib/eventCalendar.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const items = ADMIN_NAV.flatMap((g) => g.items);

test('sidebar labels equal the page titles (H1)', () => {
  const titleOf = (file) => read(file).match(/title="([^"]+)"/)?.[1];
  const pages = {
    '/admin/dashboard/overview': 'app/admin/dashboard/overview/page.js',
    '/admin/dashboard/alliance-events': 'app/admin/dashboard/alliance-events/page.js',
    '/admin/dashboard/member-pins': 'app/admin/dashboard/member-pins/page.js',
    '/admin/dashboard/interest': 'app/admin/dashboard/interest/page.js',
    '/admin/dashboard/gift-codes': 'app/admin/dashboard/gift-codes/page.js',
    '/admin/dashboard/guides': 'app/admin/dashboard/guides/page.js',
    '/admin/dashboard/gallery': 'app/admin/dashboard/gallery/page.js',
    '/admin/dashboard/heroes': 'app/admin/dashboard/heroes/page.js',
    '/admin/dashboard/help-images': 'app/admin/dashboard/help-images/page.js',
    '/admin/dashboard/page-text': 'app/admin/dashboard/page-text/page.js',
    '/admin/dashboard/tool-editing': 'app/admin/dashboard/tool-editing/page.js',
    '/admin/dashboard/tool-database': 'app/admin/dashboard/tool-database/page.js',
    '/admin/dashboard/tool-images': 'app/admin/dashboard/tool-images/page.js',
    '/admin/dashboard/form-gates': 'app/admin/dashboard/form-gates/page.js',
    '/admin/dashboard/integrations': 'app/admin/dashboard/integrations/page.js',
    '/admin/dashboard/page-addresses': 'app/admin/dashboard/page-addresses/page.js',
    '/admin/dashboard/access': 'app/admin/dashboard/access/AccessManager.jsx',
  };
  for (const [href, file] of Object.entries(pages)) {
    const item = items.find((i) => i.href === href);
    assert.ok(item, `nav entry for ${href}`);
    assert.equal(titleOf(file), item.label, `${href}: H1 must equal the sidebar label`);
  }
});

test('renamed labels keep their routes', () => {
  const label = (href) => items.find((i) => i.href === href)?.label;
  assert.equal(label('/admin/dashboard/tool-editing'), 'Pack editing');
  assert.equal(label('/admin/dashboard/form-gates'), 'Forms & copy');
  assert.equal(label('/admin/dashboard/alliance-events'), 'Calendar');
  assert.equal(label('/admin/dashboard/integrations'), 'Integrations');
  const settings = ADMIN_NAV.find((g) => g.id === 'settings');
  assert.ok(settings.items.some((i) => i.href === '/admin/dashboard/integrations'));
  assert.ok(isNavActive('/admin/dashboard/alliance-events', items.find((i) => i.label === 'Calendar')));
  assert.ok(visibleNav(false).flatMap((g) => g.items).every((i) => !i.superadminOnly));
});

test('Forms & copy is grouped from the same lists the event pages use', () => {
  const byId = Object.fromEntries(FORM_GROUPS.map((g) => [g.id, g.keys]));
  assert.deepEqual(byId.kvk, KVK_FORM_KEYS);
  assert.ok(!byId.kvk.includes('lead'), 'Power Profile is not an event form');
  assert.deepEqual(byId.standing, ['lead', 'requests']);
  assert.deepEqual(byId.flamedragon, FLAMEDRAGON_FORM_KEYS);
  assert.deepEqual(byId.other, VOTE_FORM_KEYS);
  const listed = FORM_GROUPS.flatMap((g) => g.keys);
  assert.equal(new Set(listed).size, listed.length, 'no form appears twice');
  // every switchable gate is listed except the retired schedule row
  assert.deepEqual(FORM_GATE_KEYS.filter((k) => !listed.includes(k)), ['appointments']);
});

test('the event page forms strip is read-only and points at Forms & copy', () => {
  const strip = read('components/admin/EventForms.jsx');
  assert.ok(!/onSaveWindow|onToggle|<Switch|datetime-local|fetch\(/.test(strip), 'no write controls in the strip');
  assert.ok(strip.includes('/admin/dashboard/form-gates'));
  const control = read('components/admin/EventControl.jsx');
  assert.ok(/<EventForms forms=\{state\.forms \|\| \[\]\} \/>/.test(control));
  assert.ok(control.includes('start_cycle') && control.includes('close_forms'), 'cycle actions stay');
});

test('Forms & copy has one Edit button and the Overview deep link', () => {
  const page = read('app/admin/dashboard/form-gates/page.js');
  assert.ok(!page.includes('Message & times') && !page.includes('Add message'));
  assert.ok(page.includes("'settings'"), 'reads ?settings=');
  assert.ok(read('app/admin/dashboard/overview/page.js').includes('form-gates?settings='));
});

test('Drive banner only shows when Drive is disconnected', () => {
  assert.equal(driveBannerVisible(null), false);
  assert.equal(driveBannerVisible({ connected: true }), false);
  assert.equal(driveBannerVisible({ connected: false }), true);
  assert.match(read('components/admin/DriveStatusBanner.jsx'), /driveBannerVisible\(status\)/);
  assert.match(driveHealth({ connected: true, email: 'a@b.c' }).text, /connected as a@b\.c/);
  assert.equal(driveHealth({ connected: false }).kind, 'warn');
});

test('gift code health says never checked', () => {
  assert.equal(giftCodeHealth([{ enabled: true, last_checked_at: null }]).text, 'Gift codes: never checked');
  const now = Date.parse('2026-10-09T12:00:00Z');
  assert.equal(giftCodeHealth([{ enabled: true, last_checked_at: '2026-10-09T10:00:00Z', result: 'ok' }], now).kind, 'ok');
  assert.equal(giftCodeHealth([{ enabled: true, last_checked_at: '2026-10-01T10:00:00Z', result: 'ok' }], now).kind, 'warn');
  assert.equal(giftCodeHealth([{ enabled: true, last_checked_at: '2026-10-09T10:00:00Z', result: 'blocked' }], now).kind, 'warn');
});

test('attention items are ranked by urgency, then deadline', () => {
  const ranked = rankAttention([
    { id: 'c', urgency: 40 },
    { id: 'b2', urgency: 10, whenMs: 2000 },
    { id: 'b1', urgency: 10, whenMs: 1000 },
    { id: 'd' },
  ]);
  assert.deepEqual(ranked.map((i) => i.id), ['b1', 'b2', 'c', 'd']);
  const now = 0;
  assert.equal(startsInText(3 * 24 * HOUR, now), 'in 3 days');
  assert.equal(startsInText(5 * HOUR, now), 'in 5 hours');
  assert.equal(startsInText(20 * 60000, now), 'in 20 minutes');
  assert.equal(startsInText(-5, now), 'now');
});

test('promotion to admin or superadmin needs a confirmation', () => {
  assert.equal(needsPromotionConfirm('member', 'admin'), true);
  assert.equal(needsPromotionConfirm('admin', 'superadmin'), true);
  assert.equal(needsPromotionConfirm('superadmin', 'admin'), false);
  assert.equal(needsPromotionConfirm('admin', 'member'), false);
  assert.equal(needsPromotionConfirm('member', 'member'), false);
});

test('intake periods sort newest first', () => {
  const sorted = sortPeriodsNewestFirst([
    { label: 'Sep', created_at: '2026-09-01T00:00:00Z' },
    { label: 'Nov', created_at: '2026-11-01T00:00:00Z' },
    { label: 'Oct', created_at: '2026-10-01T00:00:00Z' },
  ]);
  assert.deepEqual(sorted.map((p) => p.label), ['Nov', 'Oct', 'Sep']);
});

test('calendar cycle entries open the edit dialog with a link to the event page', () => {
  const panel = read('components/admin/EventsPanel.jsx');
  assert.ok(panel.includes('onOpen={openEdit}') && !panel.includes('router.push'));
  assert.ok(panel.includes('pageHref='));
  assert.ok(read('components/admin/EventFormDialog.jsx').includes('pageHref'));
});

test('multi-day events become one bar across the week', () => {
  const DAY = 24 * HOUR;
  const week = Array.from({ length: 7 }, (_, i) => ({ startMs: i * DAY, endMs: (i + 1) * DAY }));
  const ev = { slug: 'kvk-cycle' };
  const kvk = { key: 'k', event: ev, startMs: 1 * DAY, endMs: 5 * DAY };
  const hunt = { key: 'h', event: { slug: 'h' }, startMs: 2 * DAY + 2 * HOUR, endMs: 2 * DAY + 4 * HOUR };
  const long = { key: 'l', event: ev, startMs: 5 * DAY, endMs: 9 * DAY }; // runs past the week
  const { bars, lanes, spanKeys } = spanBarsForWeek([kvk, hunt, long], week);
  assert.equal(bars.length, 2);
  assert.deepEqual(bars.map((b) => [b.occ.key, b.col, b.len, b.lane]), [['k', 1, 4, 0], ['l', 5, 2, 0]]);
  assert.equal(bars[1].endsHere, false);
  assert.equal(lanes, 1);
  assert.ok(spanKeys.has('k') && !spanKeys.has('h'));
  // two overlapping bars stack on separate lanes
  const overlap = spanBarsForWeek([kvk, { key: 'o', event: ev, startMs: 2 * DAY, endMs: 4 * DAY }], week);
  assert.equal(overlap.lanes, 2);
});
