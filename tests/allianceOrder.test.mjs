import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderAlliances, orderAlliancesForLanding } from '../lib/alliances.mjs';
import { validateOrderedTags, sortOrderFor, nextSortOrder, stripOrderFields } from '../lib/allianceOrder.mjs';
import { allianceEventEntries } from '../lib/allianceEvents.mjs';

const saved = (tag, sort_order) => ({ tag, sort_order, order_updated_at: '2026-10-15T10:00:00.000Z' });
const plain = (tag, sort_order) => ({ tag, sort_order });
const tags = (list) => orderAlliances(list).map((a) => a.tag);

test('a saved order beats the old fixed 710, RED, SKY, PHL priority', () => {
  assert.deepEqual(tags([saved('710', 20), saved('RED', 30), saved('SKY', 10), saved('PHL', 40)]), ['SKY', '710', 'RED', 'PHL']);
  assert.deepEqual(tags([saved('PHL', 10), saved('ABC', 20), saved('710', 30)]), ['PHL', 'ABC', '710']);
  assert.equal(orderAlliancesForLanding, orderAlliances);
});

test('without a saved order today\'s order is kept, even when sort_order is missing or equal', () => {
  assert.deepEqual(tags([plain('PHL', 0), plain('SKY', 3), plain('710', 1), plain('RED', 2)]), ['710', 'RED', 'SKY', 'PHL']);
  assert.deepEqual(tags([{ tag: 'SKY' }, { tag: 'PHL' }, { tag: 'RED' }, { tag: '710' }]), ['710', 'RED', 'SKY', 'PHL']);
  assert.deepEqual(tags([plain('ZED', 2), plain('PHL', 7), plain('ABC', 1), plain('SKY'), plain('710'), plain('RED')]), ['710', 'RED', 'SKY', 'PHL', 'ABC', 'ZED']);
});

test('saved order: ties go by tag, a row with no number goes last, nothing is invented', () => {
  assert.deepEqual(tags([saved('B', 10), saved('A', 10), saved('C', 5)]), ['C', 'A', 'B']);
  assert.deepEqual(tags([saved('B', 10), { tag: 'NEW' }, saved('A', 20)]), ['B', 'A', 'NEW']);
  assert.deepEqual(tags([saved('SKY', 10)]), ['SKY']);
  assert.deepEqual(tags([]), []);
  assert.deepEqual(tags(null), []);
});

test('the saved order is a single marker on any row; a newly created row without it still follows its number', () => {
  assert.deepEqual(tags([saved('SKY', 10), saved('710', 20), plain('NEW', 30)]), ['SKY', '710', 'NEW']);
});

test('ordering twice gives the same order (public components order again)', () => {
  const rows = [saved('710', 20), saved('SKY', 10), saved('RED', 30)];
  assert.deepEqual(tags(orderAlliances(rows)), tags(rows));
});

test('inactive alliances are filtered out by the loaders before ordering: the admin list keeps them, public events drop them', () => {
  const rows = [saved('SKY', 10), { ...saved('OLD', 20), active: false }, saved('710', 30)];
  const events = allianceEventEntries(orderAlliances(rows).map((a) => ({ ...a, name: a.tag, scheduled_events: [{ type: 'vikings_vengeance', date: '2026-11-01', time_utc: '10:00' }] })));
  assert.deepEqual(events.map((e) => e.alliance_tag), ['SKY', '710']);
  assert.deepEqual(events.map((e) => e.alliance_rank), [0, 1]);
});

test('stripOrderFields removes the bookkeeping from public rows', () => {
  assert.deepEqual(stripOrderFields([{ tag: 'A', sort_order: 1, order_updated_at: 'x', name: 'A' }]), [{ tag: 'A', name: 'A' }]);
});

test('validator: the list must be exactly the set of existing tags', () => {
  const existing = ['710', 'RED', 'SKY', 'PHL'];
  assert.deepEqual(validateOrderedTags(['sky', '710', 'RED', 'PHL'], existing), { tags: ['SKY', '710', 'RED', 'PHL'] });
  assert.match(validateOrderedTags(['SKY', 'SKY', 'RED', 'PHL'], existing).error, /more than once/);
  assert.match(validateOrderedTags(['SKY', '710', 'RED', 'PHL', 'XYZ'], existing).error, /Unknown alliance: XYZ/);
  assert.match(validateOrderedTags(['SKY', '710', 'RED'], existing).error, /Missing alliance: PHL/);
  assert.match(validateOrderedTags('SKY', existing).error, /full list/);
  assert.match(validateOrderedTags(['SKY', '', '710', 'RED'], existing).error, /Every entry/);
  assert.ok(validateOrderedTags([], existing).error);
  assert.deepEqual(validateOrderedTags([], []), { tags: [] });
});

test('sort_order values are 10, 20, 30 and a new alliance goes after the last', () => {
  assert.deepEqual(sortOrderFor(['SKY', '710']), [{ tag: 'SKY', sort_order: 10 }, { tag: '710', sort_order: 20 }]);
  assert.equal(nextSortOrder([]), 10);
  assert.equal(nextSortOrder([{ sort_order: 30 }, { sort_order: 10 }]), 40);
  assert.equal(nextSortOrder([{ sort_order: 3 }, { sort_order: 0 }, { sort_order: null }, {}]), 10);
  assert.equal(nextSortOrder([{ sort_order: 25 }]), 30);
});
