import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupDefinition } from '../lib/glossaryLookup.mjs';

test('matches the exact stored term', () => {
  const entry = lookupDefinition('Bear Hunt');
  assert.ok(entry);
  assert.equal(entry.term, 'Bear Hunt');
});

test('is case-insensitive', () => {
  const entry = lookupDefinition('bear hunt');
  assert.ok(entry);
  assert.equal(entry.term, 'Bear Hunt');
});

test('matches a short form against a stored parenthetical long form', () => {
  const entry = lookupDefinition('KvK');
  assert.ok(entry);
  assert.equal(entry.term, 'KvK (Kingdom vs Kingdom)');
  assert.match(entry.definition, /war season/);
});

test('matches the full parenthetical form too', () => {
  const entry = lookupDefinition('KvK (Kingdom vs Kingdom)');
  assert.ok(entry);
  assert.equal(entry.term, 'KvK (Kingdom vs Kingdom)');
});

test('matches TrueGold and other single-word terms', () => {
  const entry = lookupDefinition('truegold');
  assert.ok(entry);
  assert.equal(entry.term, 'TrueGold');
});

test('matches terms with trailing/leading whitespace', () => {
  const entry = lookupDefinition('  Flamedragon Tyrant  ');
  assert.ok(entry);
  assert.equal(entry.term, 'Flamedragon Tyrant');
});

test('returns null for unknown terms', () => {
  assert.equal(lookupDefinition('Not A Real Term'), null);
});

test('returns null for empty input', () => {
  assert.equal(lookupDefinition(''), null);
  assert.equal(lookupDefinition(null), null);
  assert.equal(lookupDefinition(undefined), null);
});
