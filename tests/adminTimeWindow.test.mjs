import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareRowsNewestFirst,
  filterRowsUpdatedOnOrAfter,
  rowUpdatedTimestamp,
} from '../lib/adminTimeWindow.mjs';
import { autoAssignRallyMembers } from '../app/admin/dashboard/rallyState.mjs';

const rows = [
  { id: 'old', updated_at: '2026-09-01T12:00:00.000Z' },
  { id: 'new', updated_at: '2026-09-04T12:00:00.000Z' },
  { id: 'created-fallback', created_at: '2026-09-03T12:00:00.000Z' },
];

test('filters calculation inputs without changing the source rows', () => {
  const eligible = filterRowsUpdatedOnOrAfter(rows, '2026-09-03T00:00:00.000Z');
  assert.deepEqual(eligible.map((row) => row.id), ['new', 'created-fallback']);
  assert.equal(rows.length, 3);
});

test('blank cutoff includes every row', () => {
  assert.equal(filterRowsUpdatedOnOrAfter(rows, ''), rows);
});

test('sorting uses updated_at and falls back to created_at', () => {
  assert.deepEqual([...rows].sort(compareRowsNewestFirst).map((row) => row.id), [
    'new',
    'created-fallback',
    'old',
  ]);
  assert.equal(rowUpdatedTimestamp(rows[2]), Date.parse(rows[2].created_at));
});

test('auto assignment receives only members inside the selected update window', () => {
  const rallies = [{
    id: 'rally-1', name: 'Rally 1', memberIds: [], leadMemberId: '',
    troopWeights: {}, leadHeroes: {}, leadHeroAssignments: {},
  }];
  const candidates = rows.map((row) => ({
    ...row,
    member_id: row.id,
    name: row.id,
    availability: 'Full Battle',
    heroes: [],
  }));
  const eligible = filterRowsUpdatedOnOrAfter(candidates, '2026-09-03T00:00:00.000Z');
  const result = autoAssignRallyMembers(rallies, 'rally-1', eligible);
  assert.deepEqual(result.rallies[0].memberIds, ['new', 'created-fallback']);
  assert.equal(result.summary.addedCount, 2);
});
