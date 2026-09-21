import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completionLabel, isCompleted } from '../lib/formCompletion.mjs';

test('completionLabel formats a known ISO date', () => {
  assert.equal(completionLabel('2026-09-15T12:00:00.000Z'), 'Completed Sep 15');
});

test('completionLabel formats a Date instance', () => {
  assert.equal(completionLabel(new Date('2026-01-03T00:00:00.000Z')), 'Completed Jan 3');
});

test('completionLabel formats a numeric epoch timestamp', () => {
  const epoch = new Date('2026-12-25T00:00:00.000Z').getTime();
  assert.equal(completionLabel(epoch), 'Completed Dec 25');
});

test('completionLabel returns "Not yet submitted" for null/undefined/empty', () => {
  assert.equal(completionLabel(null), 'Not yet submitted');
  assert.equal(completionLabel(undefined), 'Not yet submitted');
  assert.equal(completionLabel(''), 'Not yet submitted');
});

test('completionLabel returns "Not yet submitted" for invalid date strings', () => {
  for (const bad of ['not-a-date', 'NaN', '2026-99-99', {}, []]) {
    assert.equal(completionLabel(bad), 'Not yet submitted');
  }
});

test('isCompleted mirrors completionLabel', () => {
  assert.equal(isCompleted('2026-09-15T00:00:00.000Z'), true);
  assert.equal(isCompleted(null), false);
  assert.equal(isCompleted('garbage'), false);
});
