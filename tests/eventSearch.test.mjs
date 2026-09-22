import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterEventsByQuery } from '../lib/eventSearch.mjs';

const EVENTS = [
  { event: { title: 'KvK Prep Phase', description: 'Kingdom vs Kingdom preparation window.' } },
  { event: { title: 'Flamedragon Tyrant', description: 'Dragon essence shop event.' } },
  { event: { title: 'Swordland', description: '' } },
];

test('filterEventsByQuery returns all events for an empty/whitespace query', () => {
  assert.deepEqual(filterEventsByQuery(EVENTS, ''), EVENTS);
  assert.deepEqual(filterEventsByQuery(EVENTS, '   '), EVENTS);
  assert.deepEqual(filterEventsByQuery(EVENTS, undefined), EVENTS);
});

test('filterEventsByQuery matches by title, case-insensitively', () => {
  const result = filterEventsByQuery(EVENTS, 'kvk');
  assert.equal(result.length, 1);
  assert.equal(result[0].event.title, 'KvK Prep Phase');
});

test('filterEventsByQuery matches by description', () => {
  const result = filterEventsByQuery(EVENTS, 'dragon essence');
  assert.equal(result.length, 1);
  assert.equal(result[0].event.title, 'Flamedragon Tyrant');
});

test('filterEventsByQuery returns an empty array when nothing matches', () => {
  assert.deepEqual(filterEventsByQuery(EVENTS, 'nonexistent'), []);
});

test('filterEventsByQuery is defensive against a non-array input', () => {
  assert.deepEqual(filterEventsByQuery(null, 'kvk'), []);
  assert.deepEqual(filterEventsByQuery(undefined, 'kvk'), []);
});

test('filterEventsByQuery also accepts bare event objects (no wrapper)', () => {
  const bare = [{ title: 'Championship', description: '' }];
  assert.equal(filterEventsByQuery(bare, 'champ').length, 1);
});
