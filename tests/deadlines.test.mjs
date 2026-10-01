import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  windowState, formatCountdown, isDueSoon, selectTickerItems, buildDeadlineEntries,
  windowMessage, windowBadge, formatUtc, formatClockUtc, describeEntry, HOUR, DAY,
} from '../lib/deadlines.mjs';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

test('windowState: open / upcoming / closed / admin-closed', () => {
  const gate = { is_open: true, opens_at: iso(NOW - HOUR), closes_at: iso(NOW + HOUR) };
  assert.equal(windowState(gate, NOW).state, 'open');
  assert.equal(windowState({ ...gate, opens_at: iso(NOW + HOUR) }, NOW).state, 'upcoming');
  assert.equal(windowState({ ...gate, closes_at: iso(NOW) }, NOW).state, 'closed');
  assert.equal(windowState({ ...gate, is_open: false }, NOW).state, 'closed');
  assert.equal(windowState({ is_open: true }, NOW).state, 'open');
});

test('windowState: event forms without a window stay unopened', () => {
  const w = windowState({ is_open: true }, NOW, { requireWindow: true });
  assert.equal(w.state, 'upcoming');
  assert.equal(w.opensAt, null);
  assert.equal(windowMessage(w), "Voting isn't open yet.");
});

test('window messages and badges', () => {
  const upcoming = windowState({ opens_at: '2026-10-05T14:00:00Z' }, NOW);
  assert.equal(windowMessage(upcoming, { now: NOW }), "Voting isn't open yet. Opens Oct 5, 14:00 UTC");
  assert.equal(windowBadge(upcoming), 'Opens Oct 5');
  const open = windowState({ closes_at: '2026-10-03T09:30:00Z' }, NOW);
  assert.equal(windowMessage(open, { now: NOW }), 'Vote by Oct 3, 09:30 UTC');
  assert.equal(windowBadge(open), null);
  const closed = windowState({ closes_at: '2026-09-30T00:00:00Z' }, NOW);
  assert.equal(windowMessage(closed), 'Closed');
  assert.equal(windowBadge(closed), 'Closed');
});

test('closes_at is exclusive and an unparsable date is ignored', () => {
  assert.equal(windowState({ closes_at: iso(NOW) }, NOW).state, 'closed');
  assert.equal(windowState({ closes_at: 'garbage' }, NOW).state, 'open');
});

test('formatCountdown', () => {
  assert.equal(formatCountdown(9 * DAY + 5 * HOUR), '9 days');
  assert.equal(formatCountdown(2 * DAY), '2 days');
  assert.equal(formatCountdown(47 * HOUR + 59 * 60e3), '47h 59m');
  assert.equal(formatCountdown(5 * HOUR + 12 * 60e3 + 3000), '5h 12m');
  assert.equal(formatCountdown(42 * 60e3), '42m');
  assert.equal(formatCountdown(20e3), '1m');
  assert.equal(formatCountdown(42 * 60e3 + 7e3, { seconds: true }), '42m 07s');
  assert.equal(formatCountdown(0), 'now');
  assert.equal(formatCountdown(-5), 'now');
  assert.equal(formatCountdown(NaN), 'now');
});

test('isDueSoon: within 48h, not past', () => {
  assert.equal(isDueSoon(NOW + 48 * HOUR, NOW), true);
  assert.equal(isDueSoon(NOW + 48 * HOUR + 1, NOW), false);
  assert.equal(isDueSoon(NOW, NOW), false);
  assert.equal(isDueSoon(NOW - 1, NOW), false);
  assert.equal(isDueSoon(null, NOW), false);
});

test('formatUtc adds the year only when it differs; clock is zero padded', () => {
  assert.equal(formatUtc('2026-01-02T03:04:00Z', NOW), 'Jan 2, 03:04 UTC');
  assert.equal(formatUtc('2027-01-02T03:04:00Z', NOW), 'Jan 2 2027, 03:04 UTC');
  assert.equal(formatUtc('nope'), '');
  assert.equal(formatClockUtc(Date.parse('2026-10-01T01:02:03Z')), '01:02:03 UTC');
});

const ev = (slug, offset, extra = {}) => ({
  event: { slug, title: slug, kind: 'custom', ...extra },
  occurrence: { starts_at: iso(NOW + offset), ends_at: null },
});

test('buildDeadlineEntries: events, running events, bear hunts excluded, form windows', () => {
  const entries = buildDeadlineEntries({
    events: [
      ev('kvk', 9 * DAY, { is_default: true }),
      ev('bear', HOUR, { kind: 'bear_hunt' }),
      { event: { slug: 'run', title: 'Run', kind: 'custom' }, occurrence: { starts_at: iso(NOW - HOUR), ends_at: iso(NOW + 2 * HOUR) } },
      ev('past', -DAY),
    ],
    forms: [
      { key: 'swordland', shortLabel: 'Swordland', href: '/forms/swordland-showdown', state: 'open', closesAt: NOW + 5 * HOUR, opensAt: NOW - DAY },
      { key: 'castle-battle', shortLabel: 'Castle Battle', href: '/forms/castle-battle', state: 'upcoming', closesAt: null, opensAt: NOW + 3 * DAY },
      { key: 'tri-alliance', shortLabel: 'Tri-Alliance', href: '/x', state: 'closed', closesAt: NOW - 1, opensAt: null },
    ],
  }, NOW);
  assert.deepEqual(entries.map((e) => e.id), ['event:run', 'deadline:swordland', 'opens:castle-battle', 'event:kvk']);
  assert.equal(entries[0].label, 'Run ends');
  assert.equal(entries[3].estimated, true);
  assert.equal(entries[1].label, 'Swordland vote closes');
});

test('selectTickerItems: next three future dated items, no openings, de-duplicated; empty hides the bar', () => {
  const entries = [
    { id: 'a', kind: 'event', at: NOW + 3 * DAY }, { id: 'b', kind: 'deadline', at: NOW + HOUR },
    { id: 'c', kind: 'opens', at: NOW + 2 * HOUR }, { id: 'd', kind: 'event', at: NOW - HOUR },
    { id: 'e', kind: 'event', at: NOW + DAY }, { id: 'f', kind: 'event', at: NOW + 9 * DAY },
    { id: 'b', kind: 'deadline', at: NOW + HOUR },
  ];
  assert.deepEqual(selectTickerItems(entries, NOW, 3).map((e) => e.id), ['b', 'e', 'a']);
  assert.deepEqual(selectTickerItems([], NOW), []);
  assert.deepEqual(selectTickerItems([{ id: 'x', kind: 'event', at: NOW - 1 }], NOW), []);
});

test('describeEntry: due-soon flag and precise-today for deadlines', () => {
  const soon = describeEntry({ id: 'd', kind: 'deadline', at: NOW + 3 * HOUR + 20 * 60e3 }, NOW);
  assert.equal(soon.dueSoon, true);
  assert.equal(soon.preciseToday, true);
  assert.equal(soon.countdown, '3h 20m');
  const later = describeEntry({ id: 'e', kind: 'event', at: NOW + 5 * DAY }, NOW);
  assert.equal(later.dueSoon, false);
  assert.equal(later.preciseToday, false);
  assert.equal(later.countdown, '5 days');
});

import { isNextControlFlowError, unstable_rethrow } from '../lib/rethrowNext.js';

test('rethrowNext: Next control-flow errors are re-thrown, ordinary errors are not', () => {
  const dyn = Object.assign(new Error('Dynamic server usage'), { digest: 'DYNAMIC_SERVER_USAGE' });
  assert.throws(() => unstable_rethrow(dyn), /Dynamic server usage/);
  assert.throws(() => unstable_rethrow(Object.assign(new Error('r'), { digest: 'NEXT_REDIRECT;replace;/x;307;' })));
  assert.throws(() => unstable_rethrow(new Error('wrapped', { cause: dyn })));
  assert.equal(isNextControlFlowError(new Error('MONGODB_URI is not configured.')), false);
  assert.doesNotThrow(() => unstable_rethrow(new Error('db down')));
});
