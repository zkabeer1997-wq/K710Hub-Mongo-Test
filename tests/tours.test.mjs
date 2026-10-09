import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOURS, TOUR_BODY_MAX, TOUR_UI_KEYS, availableSteps, getTour, hasPendingLater, physicalPlacement, reanchor, tourKeys, tourTone,
} from '../lib/tours/tours.mjs';
import {
  TOUR_TOOL_KEY, emptyProgress, isTourSettled, localKey, markTour, mergeProgress, normalizeProgress, parseLocal,
  progressFromLocal, serializeLocal, shouldAutoStart,
} from '../lib/tours/progress.mjs';
import {
  placePopover, reservedBottom, scrollDelta, spotRect, isSheet,
} from '../lib/tours/geometry.mjs';
import { ALL_SAVED_PLAN_STORAGE_KEYS, SUPPORTED_TOOL_KEYS } from '../lib/toolKeys.mjs';
import { ACCOUNT_SUMMARY_SOURCE_KEYS } from '../lib/accountProgressionSummary.mjs';
import { placeholdersOf } from '../lib/i18n/catalogTools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const en = JSON.parse(readFileSync(path.join(ROOT, 'i18n/en.json'), 'utf8'));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === '.next') continue;
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(jsx?|mjs)$/.test(name)) yield full;
  }
}

// ---- config / catalog --------------------------------------------------------------------

test('every tour title/body key exists in en.json with text and a translator note', () => {
  for (const tour of Object.values(TOURS)) {
    for (const key of tourKeys(tour)) {
      const entry = en[key];
      assert.ok(entry, `${key} missing from i18n/en.json`);
      assert.ok(typeof entry.text === 'string' && entry.text.trim().length > 0, `${key} has no text`);
      assert.ok(typeof entry.note === 'string' && entry.note.length >= 10, `${key} needs a translator note`);
    }
  }
  for (const key of TOUR_UI_KEYS) {
    assert.ok(en[key]?.text && en[key].note?.length >= 10, `${key} missing or without a note`);
  }
});

test('all tour.* catalog entries are used by a tour or the UI (no orphans)', () => {
  const used = new Set([...TOUR_UI_KEYS, ...Object.values(TOURS).flatMap(tourKeys)]);
  const orphans = Object.keys(en).filter((k) => k.startsWith('tour.') && !used.has(k));
  assert.deepEqual(orphans, []);
});

test('tour text stays short enough for a phone sheet and keeps placeholders', () => {
  for (const tour of Object.values(TOURS)) {
    for (const step of tour.steps) {
      assert.ok(en[step.bodyKey].text.length <= TOUR_BODY_MAX, `${step.bodyKey} is too long`);
      assert.ok(en[step.titleKey].text.length <= 48, `${step.titleKey} is too long`);
      assert.deepEqual(placeholdersOf(en[step.bodyKey].text), [], `${step.bodyKey} must not use placeholders`);
    }
  }
  assert.deepEqual(placeholdersOf(en['tour.ui.stepOf'].text).sort(), ['current', 'total']);
  assert.deepEqual(placeholdersOf(en['tour.ui.live'].text).sort(), ['current', 'title', 'total']);
});

test('tour registry is well formed', () => {
  const seenIds = new Set();
  for (const [id, tour] of Object.entries(TOURS)) {
    assert.equal(tour.id, id);
    assert.ok(Number.isInteger(tour.version) && tour.version >= 1);
    assert.ok(['member', 'applicant'].includes(tour.audience));
    assert.ok(tour.route.startsWith('/') && !tour.route.startsWith('/admin'), `${id} must not be an admin route`);
    assert.match(id, /^[a-z0-9]+$/, 'tour ids are plain words (they appear in catalog keys)');
    assert.ok(tour.steps.length >= 4 && tour.steps.length <= 8, `${id} should have 4-8 steps`);
    assert.ok(tour.steps.some((s) => !s.optional), `${id} needs at least one always-present step`);
    for (const step of tour.steps) {
      assert.ok(!seenIds.has(step.id), `duplicate step id ${step.id}`);
      seenIds.add(step.id);
      assert.match(step.anchor, /^[a-z0-9-]+$/);
      assert.ok(['auto', 'top', 'bottom', 'start', 'end'].includes(step.placement));
    }
  }
  assert.equal(getTour('nope'), null);
  assert.equal(getTour('__proto__'), null);
  assert.equal(tourTone(TOURS.interest), 'realm');
  assert.equal(tourTone(TOURS.prep), 'console');
});

test('every anchor used in the tour config exists as a data-tour attribute in the source', () => {
  const haystack = [...['app', 'components'].flatMap((d) => [...sourceFiles(path.join(ROOT, d))])]
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  const missing = [];
  for (const tour of Object.values(TOURS)) {
    for (const step of tour.steps) {
      const direct = new RegExp(`data-tour=(?:"|\\{'|\\{")${step.anchor}(?:"|'|\\})`);
      const viaProp = new RegExp(`(?:tourAnchor|tour)=(?:"|\\{'|\\{")${step.anchor}(?:"|'|\\})`);
      const inTernary = new RegExp(`'${step.anchor}'`);
      if (!(direct.test(haystack) || viaProp.test(haystack) || inTernary.test(haystack))) missing.push(`${tour.id}/${step.anchor}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('each form page mounts the launcher for its tour', () => {
  const places = {
    prep: 'app/prep-phase-backpack/PrepBackpackForm.js',
    avail: 'app/dashboard/PlayerRecordForm.js',
    dragon: 'app/flamedragon/FlamedragonClient.js',
    noble: 'app/forms/flamedragon-tyrant/noble-advisor/page.js',
    power: 'app/power-profile/PowerProfileClient.js',
    interest: 'app/interest/page.js',
    dash: 'components/member/MemberDashboard.jsx',
  };
  assert.deepEqual(Object.keys(places).sort(), Object.keys(TOURS).sort());
  for (const [id, file] of Object.entries(places)) {
    assert.ok(read(file).includes(`<TourLauncher id="${id}"`), `${file} should render <TourLauncher id="${id}" />`);
  }
});

test('tools are left alone: no tour launcher or anchor in the calculators', () => {
  for (const file of sourceFiles(path.join(ROOT, 'components/tools'))) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('TourLauncher') && !text.includes('data-tour'), `${path.relative(ROOT, file)} must not use tours`);
  }
});

test('the provider is mounted in the root layout and the overlay sits between modals and toasts', () => {
  assert.ok(read('app/layout.js').includes('<TourProvider>'));
  assert.match(read('app/tokens.css'), /--z-tour:\s*500;/);
  const css = read('components/tour/tour.css');
  assert.ok(css.includes('z-index: var(--z-tour'));
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('data-easy'));
});

// ---- saved-plan code must not mistake tour progress for a saved plan --------------------------

test('tour-progress is not a tool key, saved plan or account-summary source', () => {
  assert.equal(TOUR_TOOL_KEY, 'tour-progress');
  assert.ok(!SUPPORTED_TOOL_KEYS.includes(TOUR_TOOL_KEY));
  assert.ok(!ALL_SAVED_PLAN_STORAGE_KEYS.includes(TOUR_TOOL_KEY));
  assert.ok(!ACCOUNT_SUMMARY_SOURCE_KEYS.includes(TOUR_TOOL_KEY));
  // The per-tool route accepts it (same character rule), and its size cap is far above what we store.
  assert.match(TOUR_TOOL_KEY, /^[a-z0-9-]{1,64}$/);
  const all = Object.keys(TOURS).reduce((acc, id) => markTour(acc, id, 99, 'skipped', '2026-10-09T00:00:00.000Z'), emptyProgress());
  assert.ok(JSON.stringify(all).length < 50000);
});

// ---- progress ---------------------------------------------------------------------------------

test('progress: normalize drops garbage', () => {
  assert.deepEqual(normalizeProgress(null), emptyProgress());
  assert.deepEqual(normalizeProgress({ completed: { prep: { version: 'x' }, 'BAD ID': { version: 1 }, avail: { version: 2, ts: 't' } }, skipped: [] }), {
    completed: { avail: { version: 2, ts: 't' } },
    skipped: {},
  });
});

test('progress: done on either side wins and newer versions win', () => {
  const local = markTour(emptyProgress(), 'prep', 1, 'completed', '2026-01-01T00:00:00.000Z');
  const remote = markTour(emptyProgress(), 'avail', 1, 'skipped', '2026-01-02T00:00:00.000Z');
  const merged = mergeProgress(local, remote);
  assert.ok(isTourSettled(merged, 'prep', 1));
  assert.ok(isTourSettled(merged, 'avail', 1));
  assert.ok(!isTourSettled(merged, 'noble', 1));
  // A tour revised to version 2 starts again for people who only saw version 1.
  assert.ok(!isTourSettled(merged, 'prep', 2));
  const upgraded = mergeProgress(merged, markTour(emptyProgress(), 'prep', 2, 'completed', '2026-02-01T00:00:00.000Z'));
  assert.equal(upgraded.completed.prep.version, 2);
  assert.ok(isTourSettled(upgraded, 'prep', 2));
  // Merging is order independent.
  assert.deepEqual(mergeProgress(local, remote), mergeProgress(remote, local));
});

test('progress: latest timestamp wins within one version, markTour does not mutate', () => {
  const a = markTour(emptyProgress(), 'prep', 1, 'completed', '2026-01-01T00:00:00.000Z');
  const b = markTour(a, 'prep', 1, 'completed', '2026-03-01T00:00:00.000Z');
  assert.equal(b.completed.prep.ts, '2026-03-01T00:00:00.000Z');
  assert.equal(a.completed.prep.ts, '2026-01-01T00:00:00.000Z');
});

test('progress: local storage format round trips and rejects junk', () => {
  assert.equal(localKey('interest', 1), 'k710-tour:interest:v1');
  assert.deepEqual(parseLocal(serializeLocal('skipped', 't')), { state: 'skipped', ts: 't' });
  assert.deepEqual(parseLocal(serializeLocal('completed', 't')), { state: 'completed', ts: 't' });
  assert.equal(parseLocal(null), null);
  assert.equal(parseLocal('not json'), null);
  assert.equal(parseLocal('{"state":"weird"}'), null);
  assert.ok(isTourSettled(progressFromLocal('prep', 1, parseLocal(serializeLocal('completed'))), 'prep', 1));
});

test('auto start: once, never in admin, only when ready', () => {
  assert.equal(shouldAutoStart({ settled: false, pathname: '/prep-phase-backpack' }), true);
  assert.equal(shouldAutoStart({ settled: true, pathname: '/prep-phase-backpack' }), false);
  assert.equal(shouldAutoStart({ settled: false, pathname: '/admin' }), false);
  assert.equal(shouldAutoStart({ settled: false, pathname: '/admin/dashboard/overview' }), false);
  assert.equal(shouldAutoStart({ settled: false, pathname: '/dashboard', ready: false }), false);
  assert.equal(shouldAutoStart({ settled: false, pathname: '/administrators' }), true);
});

// ---- step filtering / re-anchoring ---------------------------------------------------------------

test('steps whose anchor is missing are skipped silently', () => {
  const tour = TOURS.interest;
  const present = new Set(['interest-progress', 'interest-identity', 'interest-nav']);
  const avail = availableSteps(tour, (s) => present.has(s.anchor));
  assert.deepEqual(avail.map((s) => s.anchor), ['interest-progress', 'interest-identity', 'interest-nav']);
  // a throwing resolver counts as missing, never crashes
  assert.deepEqual(availableSteps(tour, () => { throw new Error('x'); }), []);
});

test('wizard tours follow the visitor: re-anchor and pending hint', () => {
  const tour = TOURS.interest;
  const step0 = availableSteps(tour, (s) => ['interest-progress', 'interest-ready', 'interest-identity', 'interest-nav'].includes(s.anchor));
  assert.equal(reanchor(tour, 'interest-4', step0), 'interest-4');
  assert.equal(hasPendingLater(tour, 'interest-4', step0), true);
  // The visitor pressed Continue: the step 0 tips vanish and the "power" tip appears.
  const step2 = availableSteps(tour, (s) => ['interest-progress', 'interest-power', 'interest-nav'].includes(s.anchor));
  assert.equal(reanchor(tour, 'interest-3', step2), 'interest-4', 'moves forward to the next visible tip');
  assert.equal(reanchor(tour, 'interest-6', step2), 'interest-6');
  // Nothing after the current one is visible: fall back to the closest earlier tip.
  const onlyEarly = availableSteps(tour, (s) => ['interest-progress'].includes(s.anchor));
  assert.equal(reanchor(tour, 'interest-8', onlyEarly), 'interest-1');
  assert.equal(reanchor(tour, 'interest-1', []), null);
  assert.equal(reanchor(tour, null, step0), 'interest-1');
});

test('logical placement flips in right-to-left', () => {
  assert.equal(physicalPlacement('start', 'ltr'), 'left');
  assert.equal(physicalPlacement('start', 'rtl'), 'right');
  assert.equal(physicalPlacement('end', 'ltr'), 'right');
  assert.equal(physicalPlacement('end', 'rtl'), 'left');
  assert.equal(physicalPlacement('top', 'rtl'), 'top');
});

// ---- geometry ---------------------------------------------------------------------------------------

const VIEW = { width: 1440, height: 900 };

test('popover prefers the requested side and flips when there is no room', () => {
  const size = { width: 380, height: 220 };
  const mid = { top: 300, left: 500, width: 400, height: 80 };
  assert.equal(placePopover({ rect: mid, size, viewport: VIEW, placement: 'bottom' }).side, 'bottom');
  assert.equal(placePopover({ rect: mid, size, viewport: VIEW, placement: 'top' }).side, 'top');
  const low = { top: 760, left: 500, width: 400, height: 80 };
  assert.equal(placePopover({ rect: low, size, viewport: VIEW, placement: 'bottom' }).side, 'top', 'flips up near the bottom edge');
  const high = { top: 70, left: 500, width: 400, height: 60 };
  assert.equal(placePopover({ rect: high, size, viewport: VIEW, insets: { top: 64, bottom: 0 }, placement: 'top' }).side, 'bottom', 'respects the sticky header');
});

test('popover start/end follow the document direction and stay inside the screen', () => {
  const size = { width: 360, height: 200 };
  const rect = { top: 300, left: 600, width: 200, height: 100 };
  assert.equal(placePopover({ rect, size, viewport: VIEW, placement: 'start', dir: 'ltr' }).side, 'left');
  assert.equal(placePopover({ rect, size, viewport: VIEW, placement: 'start', dir: 'rtl' }).side, 'right');
  const edge = placePopover({ rect: { top: 300, left: 1380, width: 40, height: 40 }, size, viewport: VIEW, placement: 'bottom' });
  assert.ok(edge.left + size.width <= VIEW.width - 8, 'clamped to the right edge');
  const tall = placePopover({ rect: { top: 100, left: 100, width: 1200, height: 800 }, size, viewport: VIEW, insets: { top: 64, bottom: 0 } });
  assert.equal(tall.side, 'over');
  assert.ok(tall.top >= 64 && tall.top + size.height <= VIEW.height);
});

test('spotlight stays inside the viewport and scrolling clears the header and the sheet', () => {
  const spot = spotRect({ top: -20, left: 10, width: 300, height: 100 }, VIEW, 6);
  assert.ok(spot.top >= 0 && spot.left >= 0);
  assert.equal(scrollDelta({ rect: { top: 300, height: 80 }, viewportHeight: 800, insets: { top: 64, bottom: 0 } }), 0);
  assert.ok(scrollDelta({ rect: { top: 20, height: 80 }, viewportHeight: 800, insets: { top: 64, bottom: 0 } }) < 0, 'scroll up when under the header');
  // On a phone the sheet (260px) covers the bottom: an element at y=700 must move up.
  const d = scrollDelta({ rect: { top: 700, height: 60 }, viewportHeight: 800, insets: { top: 64, bottom: 260 } });
  assert.ok(d > 0 && 700 - d + 60 <= 800 - 260);
  assert.equal(scrollDelta({ rect: { top: 740, height: 60 }, viewportHeight: 800, insets: { top: 64, bottom: 60 + 260 }, reserved: 60 }), 0, 'a stuck bar is not scrolled');
  assert.ok(scrollDelta({ rect: { top: 1500, height: 200 }, viewportHeight: 800, insets: { top: 64, bottom: 60 + 260 }, reserved: 60 }) > 0, 'a section far below the bar still scrolls into view');
  assert.ok(isSheet(390) && !isSheet(1024));
});

test('sticky bottom bars are reserved so the sheet never covers them', () => {
  assert.equal(reservedBottom([{ top: 740, height: 60 }], 800), 60);
  assert.equal(reservedBottom([{ top: 300, height: 60 }], 800), 0, 'a bar scrolled into the page is not stuck to the edge');
  assert.equal(reservedBottom([], 800), 0);
});
