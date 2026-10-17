import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionFor, normalizeStatus, normalizeCap } from '../lib/intakeProjection.mjs';

test('projection shows the selected status and only its cap', () => {
  assert.deepEqual(projectionFor({ transfer_status: 'leading', leading_cap: ' 250M ', ordinary_cap: '400M' }), { status: 'leading', name: 'Leading', cap: '250M' });
  assert.deepEqual(projectionFor({ transfer_status: 'ordinary', leading_cap: '250M', ordinary_cap: '400M' }), { status: 'ordinary', name: 'Ordinary', cap: '400M' });
  assert.deepEqual(projectionFor({ transfer_status: 'ordinary' }), { status: 'ordinary', name: 'Ordinary', cap: null });
});

test('no status means nothing is shown', () => {
  assert.equal(projectionFor(null), null);
  assert.equal(projectionFor({ transfer_status: '' }), null);
  assert.equal(projectionFor({ transfer_status: 'bogus', leading_cap: '1M' }), null);
});

test('inputs are normalised', () => {
  assert.equal(normalizeStatus(' Leading '), 'leading');
  assert.equal(normalizeStatus('x'), null);
  assert.equal(normalizeCap('x'.repeat(40)).length, 20);
});
