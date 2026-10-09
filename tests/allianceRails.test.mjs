import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RAIL_ANCHORS, formatCountdown, kvkRailData, nextHuntCountdown, pickActiveAnchor, railChips,
} from '../lib/allianceRails.mjs';

const at = (h, m, s = 0) => Date.UTC(2026, 9, 9, h, m, s);

test('countdown formatting: HH:MM:SS, floors partial seconds, never negative', () => {
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(999), '00:00:00');
  assert.equal(formatCountdown(1000), '00:00:01');
  assert.equal(formatCountdown(2 * 3600e3 + 14 * 60e3 + 9e3), '02:14:09');
  assert.equal(formatCountdown(23 * 3600e3 + 59 * 60e3 + 59e3), '23:59:59');
  assert.equal(formatCountdown(-5000), '00:00:00');
  assert.equal(formatCountdown(NaN), '00:00:00');
});

test('next hunt: picks the soonest time today, wraps to tomorrow, reports the hunt number', () => {
  const times = ['13:00', '22:00'];
  assert.deepEqual(nextHuntCountdown(times, at(10, 45, 30)), { time: '13:00', index: 0, ms: (2 * 60 + 14) * 60e3 + 30e3 });
  assert.deepEqual(nextHuntCountdown(times, at(13, 1, 1)), { time: '22:00', index: 1, ms: (8 * 3600 + 58 * 60 + 59) * 1000 });
  // after the last hunt of the day the first one tomorrow is next
  assert.deepEqual(nextHuntCountdown(times, at(23, 0, 0)), { time: '13:00', index: 0, ms: 14 * 3600e3 });
  // unsorted input is sorted (Hunt 1 is the earliest time of the day)
  assert.equal(nextHuntCountdown(['22:00', '13:00'], at(12, 0)).index, 0);
});

test('next hunt: a hunt that started within the current minute counts as now (0), like the highlight', () => {
  assert.equal(nextHuntCountdown(['13:00'], at(13, 0, 30)).ms, 0);
  assert.equal(nextHuntCountdown(['13:00', '22:00'], at(13, 0, 30)).time, '13:00');
  assert.equal(nextHuntCountdown(['13:00'], at(13, 1, 0)).ms, 24 * 3600e3 - 60e3);
});

test('next hunt: nothing when the alliance has no (valid) times', () => {
  assert.equal(nextHuntCountdown([], at(1, 0)), null);
  assert.equal(nextHuntCountdown(undefined, at(1, 0)), null);
  assert.equal(nextHuntCountdown(['25:99'], at(1, 0)), null);
});

test('alliance chips: every active alliance in landing order, links lower-case, current one marked', () => {
  const list = [
    { tag: 'QA5', name: 'Fifth', sort_order: 5 }, { tag: 'PHL', name: 'Phoenix' }, { tag: 'SKY', name: 'Sky' },
    { tag: '710', name: 'Zenzen' }, { tag: 'RED', name: 'Red' },
  ];
  const chips = railChips(list, 'sky');
  assert.deepEqual(chips.map((c) => c.tag), ['710', 'RED', 'SKY', 'PHL', 'QA5']);
  assert.deepEqual(chips.map((c) => c.href), ['/alliances/710', '/alliances/red', '/alliances/sky', '/alliances/phl', '/alliances/qa5']);
  assert.deepEqual(chips.filter((c) => c.current).map((c) => c.tag), ['SKY']);
  assert.equal(railChips(list, 'nope').some((c) => c.current), false);
  assert.deepEqual(railChips([], '710'), []);
  assert.deepEqual(railChips(undefined, '710'), []);
  assert.equal(railChips([{ tag: 'XY' }], 'xy')[0].name, 'XY');
});

test('section links: Overview, Leadership, Bear Hunt, Join, each with a real id and a label key', () => {
  assert.deepEqual(RAIL_ANCHORS.map((a) => a.id), ['al-overview', 'al-leadership', 'al-bear', 'al-join']);
  for (const a of RAIL_ANCHORS) assert.match(a.labelKey, /^alliances\./);
});

test('scrollspy choice: first visible in page order, a clicked link wins while visible, falls back to previous', () => {
  assert.equal(pickActiveAnchor(new Set(['al-leadership', 'al-bear', 'al-join'])), 'al-leadership');
  assert.equal(pickActiveAnchor(new Set(['al-overview', 'al-leadership'])), 'al-overview');
  assert.equal(pickActiveAnchor(new Set(['al-leadership', 'al-bear', 'al-join']), RAIL_ANCHORS, '', 'al-join'), 'al-join');
  assert.equal(pickActiveAnchor(new Set(['al-leadership']), RAIL_ANCHORS, '', 'al-join'), 'al-leadership');
  assert.equal(pickActiveAnchor(new Set(), RAIL_ANCHORS, 'al-bear'), 'al-bear');
  assert.equal(pickActiveAnchor(new Set()), 'al-overview');
});

test('KvK card data: wins and losses from the About figure; hidden when there is nothing to show', () => {
  assert.deepEqual(kvkRailData({ record: { wins: 11, losses: 2 }, stale: false }), { wins: 11, losses: 2, stale: false });
  assert.deepEqual(kvkRailData({ record: { wins: 11, losses: 2 }, stale: true }), { wins: 11, losses: 2, stale: true });
  assert.equal(kvkRailData(null), null);
  assert.equal(kvkRailData({}), null);
  assert.equal(kvkRailData({ record: { wins: 0, losses: 0 } }), null);
  assert.equal(kvkRailData({ record: { wins: 'x', losses: 1 } }), null);
});
