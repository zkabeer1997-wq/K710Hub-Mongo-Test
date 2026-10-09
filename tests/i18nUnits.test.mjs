import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clientKey, distributeUnit, escapeUnitText, hashString, isTranslatableText, looksTranslated, normalizeUnit, parseUnit, splitEdges, tagSignature,
} from '../lib/i18n/units.mjs';
import { buildMatcher, glossaryTerms } from '../lib/i18n/catalogTools.mjs';
import glossary from '../i18n/glossary.json' with { type: 'json' };

const glossaryRe = buildMatcher(glossaryTerms(glossary));

test('normalizeUnit collapses whitespace and splitEdges keeps the edges', () => {
  assert.equal(normalizeUnit('  Hello \n  world  '), 'Hello world');
  assert.deepEqual(splitEdges('  Hi there. \n'), { lead: '  ', core: 'Hi there.', trail: ' \n' });
  assert.deepEqual(splitEdges('   '), { lead: '   ', core: '', trail: '' });
});

test('numbers, dates, ids, urls and bare codes are never translated', () => {
  for (const s of ['12', '3,450,000', '2026-10-09', '12:30 UTC', 'https://k710.example/x', 'a@b.co', 'ABCD1234', 'v1.2.3', '/forms/kvk', '—', '99%', 'x']) {
    assert.equal(isTranslatableText(s), false, s);
  }
  for (const s of ['Save', 'Sign in to continue', 'Open forms', 'Next: Hero gear']) assert.equal(isTranslatableText(s), true, s);
});

test('glossary-only labels are left alone, real sentences containing them are not', () => {
  assert.equal(isTranslatableText('KvK', { glossaryRe }), false);
  assert.equal(isTranslatableText('Kingshot', { glossaryRe }), false);
  assert.equal(isTranslatableText('KvK 710', { glossaryRe }), false);
  assert.equal(isTranslatableText('Join the KvK prep today', { glossaryRe }), true);
});

test('text already in the target script is skipped for non-Latin languages', () => {
  assert.equal(looksTranslated('저장하기', 'ko'), true);
  assert.equal(looksTranslated('Save', 'ko'), false);
  assert.equal(isTranslatableText('保存', { lang: 'zh' }), false);
  assert.equal(isTranslatableText('Save', { lang: 'zh' }), true);
  // Latin-script languages cannot be told apart by script; the catalog matcher handles those.
  assert.equal(looksTranslated('Guardar', 'es'), false);
});

test('tags are tracked and distributed back onto slots and inline elements', () => {
  const unit = 'Join the <x1>Flamedragon Tyrant</x1> event today';
  assert.equal(tagSignature(unit), 'o1,c1');
  assert.deepEqual(parseUnit(unit).map((t) => Object.keys(t)[0]), ['text', 'open', 'text', 'close', 'text']);
  const parts = distributeUnit('Rejoignez l&apos;événement <x1>Flamedragon Tyrant</x1> aujourd&apos;hui', unit);
  assert.deepEqual(parts.texts, ["Rejoignez l'événement ", " aujourd'hui"]);
  assert.deepEqual(parts.inner, { 1: 'Flamedragon Tyrant' });
  // markup that the engine broke is refused rather than guessed at
  assert.equal(distributeUnit('Rejoignez <x1>Flamedragon', unit), null);
  assert.equal(distributeUnit('Rejoignez l’événement', unit), null);
});

test('literal angle brackets and ampersands survive the unit encoding', () => {
  const unit = `Tom ${escapeUnitText('& Jerry <3')} <x1>now</x1>`;
  assert.equal(tagSignature(unit), 'o1,c1');
  assert.equal(parseUnit(unit)[0].text, 'Tom & Jerry <3 ');
});

test('hashString is stable and language-scoped', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(clientKey('es', 'Save'), clientKey('fr', 'Save'));
  assert.equal(clientKey('es', 'Save  '), clientKey('es', ' Save'));
});
