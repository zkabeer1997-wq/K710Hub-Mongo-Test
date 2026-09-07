import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareRowsNewestFirst,
  filterRowsUpdatedOnOrAfter,
  rowUpdatedTimestamp,
} from '../lib/adminTimeWindow.mjs';

test('rowUpdatedTimestamp prefers updated_at over created_at', () => {
  assert.equal(
    rowUpdatedTimestamp({ updated_at: '2026-09-01T12:00:00.000Z', created_at: '2026-08-01T12:00:00.000Z' }),
    Date.parse('2026-09-01T12:00:00.000Z'),
  );
  assert.equal(rowUpdatedTimestamp({ created_at: '2026-08-01T12:00:00.000Z' }), Date.parse('2026-08-01T12:00:00.000Z'));
  assert.equal(rowUpdatedTimestamp({}), 0);
});

test('filterRowsUpdatedOnOrAfter keeps rows on or after the cutoff', () => {
  const rows = [
    { id: 'old', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'edge', updated_at: '2026-09-01T12:00:00.000Z' },
    { id: 'new', updated_at: '2026-09-02T08:00:00.000Z' },
  ];
  const filtered = filterRowsUpdatedOnOrAfter(rows, '2026-09-01T12:00:00.000Z');
  assert.deepEqual(filtered.map((row) => row.id), ['edge', 'new']);
  assert.deepEqual(filterRowsUpdatedOnOrAfter(rows, ''), rows);
  assert.deepEqual(filterRowsUpdatedOnOrAfter(rows, 'not-a-date'), rows);
});

test('compareRowsNewestFirst sorts by newest update first', () => {
  const rows = [
    { id: 'old', updated_at: '2026-08-01T10:00:00.000Z' },
    { id: 'new', updated_at: '2026-09-02T08:00:00.000Z' },
    { id: 'mid', created_at: '2026-09-01T12:00:00.000Z' },
  ];
  const sorted = [...rows].sort(compareRowsNewestFirst);
  assert.deepEqual(sorted.map((row) => row.id), ['new', 'mid', 'old']);
});
