import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_VERSION,
  clampIndex,
  draftKey,
  firstInvalidStep,
  isSensitiveKey,
  limitToValidStep,
  mergeDraft,
  parseDraft,
  parseStepParam,
  serializeDraft,
  stripSensitive,
  withStepParam,
} from '../lib/wizardState.mjs';

test('parseStepParam converts a 1-based param to a clamped 0-based index', () => {
  assert.equal(parseStepParam('1', 5), 0);
  assert.equal(parseStepParam('3', 5), 2);
  assert.equal(parseStepParam('5', 5), 4);
});

test('parseStepParam clamps out-of-range and rejects invalid values', () => {
  assert.equal(parseStepParam('99', 5), 4);
  assert.equal(parseStepParam('0', 5), 0);
  assert.equal(parseStepParam('-3', 5), 0);
  assert.equal(parseStepParam('abc', 5), 0);
  assert.equal(parseStepParam('2.5', 5), 0);
  assert.equal(parseStepParam('', 5), 0);
  assert.equal(parseStepParam(null, 5), 0);
  assert.equal(parseStepParam(undefined, 5), 0);
});

test('clampIndex handles NaN and degenerate step counts', () => {
  assert.equal(clampIndex(NaN, 5), 0);
  assert.equal(clampIndex(7, 5), 4);
  assert.equal(clampIndex(-1, 5), 0);
  assert.equal(clampIndex(3, 0), 0);
});

test('limitToValidStep stops a deep link at the first invalid step', () => {
  assert.equal(limitToValidStep(4, -1, 5), 4);
  assert.equal(limitToValidStep(4, 1, 5), 1);
  assert.equal(limitToValidStep(0, 1, 5), 0);
  assert.equal(limitToValidStep(9, null, 5), 4);
});

test('firstInvalidStep scans steps in order', () => {
  const errs = { 0: [], 1: ['x'], 2: ['y'] };
  assert.equal(firstInvalidStep(5, (i) => errs[i] || []), 1);
  assert.equal(firstInvalidStep(5, () => []), -1);
});

test('withStepParam sets step and preserves other params', () => {
  assert.equal(withStepParam('', 2), '?step=3');
  assert.equal(withStepParam('?member_id=42&step=1', 1), '?member_id=42&step=2');
});

test('isSensitiveKey flags pins/passwords/files but not "passes"', () => {
  assert.equal(isSensitiveKey('memberPin'), true);
  assert.equal(isSensitiveKey('admin_password'), true);
  assert.equal(isSensitiveKey('screenshots'), true);
  assert.equal(isSensitiveKey('pin'), true);
  assert.equal(isSensitiveKey('passesRequired'), false);
  assert.equal(isSensitiveKey('currentPasses'), false);
  assert.equal(isSensitiveKey('inGameName'), false);
});

test('serializeDraft is versioned and drops sensitive values', () => {
  const raw = serializeDraft({ inGameName: 'A', pin: '1234', password: 'x', screenshots: ['f'], nested: { token: 't', ok: 1 } }, 1000);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.v, DRAFT_VERSION);
  assert.equal(parsed.savedAt, 1000);
  assert.deepEqual(parsed.data, { inGameName: 'A', nested: { ok: 1 } });
});

test('parseDraft round-trips and rejects bad input', () => {
  const raw = serializeDraft({ a: '1', t11: ['Infantry'] }, 5000);
  assert.deepEqual(parseDraft(raw, { now: 6000 }), { a: '1', t11: ['Infantry'] });
  assert.equal(parseDraft('not json'), null);
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft(JSON.stringify({ v: 999, data: {} })), null);
  assert.equal(parseDraft(JSON.stringify({ v: DRAFT_VERSION, data: [] })), null);
  assert.equal(parseDraft(raw, { now: 5000 + 1e12 }), null);
});

test('parseDraft re-strips sensitive keys from a tampered draft', () => {
  const raw = JSON.stringify({ v: DRAFT_VERSION, savedAt: Date.now(), data: { name: 'x', pin: '9' } });
  assert.deepEqual(parseDraft(raw), { name: 'x' });
});

test('mergeDraft only takes known keys with matching types', () => {
  const defaults = { name: '', t11: [], count: 0 };
  assert.deepEqual(mergeDraft(defaults, { name: 'Z', t11: ['a'], count: 'bad', extra: 1 }), { name: 'Z', t11: ['a'], count: 0 });
  assert.equal(mergeDraft(defaults, null), defaults);
});

test('draftKey is namespaced and versioned', () => {
  assert.equal(draftKey('interest'), `k710-draft:interest:v${DRAFT_VERSION}`);
});

test('stripSensitive removes functions', () => {
  assert.deepEqual(stripSensitive({ a: 1, b: () => 1 }), { a: 1 });
});
