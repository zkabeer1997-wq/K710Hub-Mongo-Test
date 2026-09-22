import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guideDifficultyLabel, startHereSlug } from '../lib/guideTags.mjs';

test('guideDifficultyLabel returns a valid level as-is', () => {
  assert.equal(guideDifficultyLabel({ difficulty: 'Beginner' }), 'Beginner');
  assert.equal(guideDifficultyLabel({ difficulty: 'Intermediate' }), 'Intermediate');
  assert.equal(guideDifficultyLabel({ difficulty: 'Advanced' }), 'Advanced');
});

test('guideDifficultyLabel returns null when the field is absent', () => {
  assert.equal(guideDifficultyLabel({}), null);
  assert.equal(guideDifficultyLabel(null), null);
  assert.equal(guideDifficultyLabel(undefined), null);
});

test('guideDifficultyLabel returns null for an unrecognized/invalid value (never fabricated)', () => {
  assert.equal(guideDifficultyLabel({ difficulty: 'expert' }), null);
  assert.equal(guideDifficultyLabel({ difficulty: '' }), null);
  assert.equal(guideDifficultyLabel({ difficulty: 3 }), null);
});

test('startHereSlug returns null for an empty list', () => {
  assert.equal(startHereSlug([]), null);
  assert.equal(startHereSlug(null), null);
  assert.equal(startHereSlug(undefined), null);
});

test('startHereSlug prefers an explicit start_here flag', () => {
  const guides = [
    { slug: 'a', position: 0 },
    { slug: 'b', position: 1, start_here: true },
  ];
  assert.equal(startHereSlug(guides), 'b');
});

test('startHereSlug falls back to the lowest position when no explicit flag is set', () => {
  const guides = [
    { slug: 'c', position: 5 },
    { slug: 'a', position: 0 },
    { slug: 'b', position: 2 },
  ];
  assert.equal(startHereSlug(guides), 'a');
});

test('startHereSlug treats a missing position as last', () => {
  const guides = [{ slug: 'no-position' }, { slug: 'first', position: 0 }];
  assert.equal(startHereSlug(guides), 'first');
});
