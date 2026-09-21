import test from 'node:test';
import assert from 'node:assert/strict';
import { heroSlug, saveStatusLabel, clampStep } from '../lib/powerProfileWizard.mjs';

test('heroSlug lowercases and hyphenates', () => {
  assert.equal(heroSlug('Long Fei'), 'long-fei');
  assert.equal(heroSlug('Chenko'), 'chenko');
  assert.equal(heroSlug('  Yeonwoo  '), 'yeonwoo');
  assert.equal(heroSlug('Multi   Space Name'), 'multi-space-name');
});

test('heroSlug handles empty/falsy input', () => {
  assert.equal(heroSlug(''), '');
  assert.equal(heroSlug(undefined), '');
  assert.equal(heroSlug(null), '');
});

test('saveStatusLabel prioritizes loading over everything else', () => {
  assert.equal(
    saveStatusLabel({ loading: true, isError: true, dirty: true, status: 'x' }),
    'Saving…',
  );
});

test('saveStatusLabel surfaces an error message when not loading', () => {
  assert.equal(
    saveStatusLabel({ loading: false, isError: true, dirty: false, status: 'Could not save.' }),
    'Could not save.',
  );
  assert.equal(
    saveStatusLabel({ loading: false, isError: true, dirty: false, status: '' }),
    'Save failed',
  );
});

test('saveStatusLabel reports unsaved changes before a successful status exists', () => {
  assert.equal(
    saveStatusLabel({ loading: false, isError: false, dirty: true, status: '' }),
    'Unsaved changes',
  );
});

test('saveStatusLabel reports saved once status is set and nothing is dirty', () => {
  assert.equal(
    saveStatusLabel({ loading: false, isError: false, dirty: false, status: 'Gear Tracking updated.' }),
    'All changes saved',
  );
});

test('saveStatusLabel is blank in the idle/untouched state', () => {
  assert.equal(saveStatusLabel({ loading: false, isError: false, dirty: false, status: '' }), '');
});

test('clampStep keeps an index within bounds', () => {
  assert.equal(clampStep(2, 5), 2);
  assert.equal(clampStep(-1, 5), 0);
  assert.equal(clampStep(9, 5), 4);
  assert.equal(clampStep(NaN, 5), 0);
});
