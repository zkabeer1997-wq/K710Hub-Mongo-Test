import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTranslator, flattenSource, sanitizeMessages, interpolate } from '../lib/i18n/translate.mjs';
import { normalizeLanguage, getLanguage, languageDir, LANGUAGES } from '../lib/i18n/languages.mjs';

const en = {
  'a.hello': 'Hi {name}',
  'a.left.one': 'You have {count} form left.',
  'a.left.other': 'You have {count} forms left.',
  'a.only': 'Only English',
};

test('interpolates variables and leaves unknown placeholders visible', () => {
  const t = createTranslator({ fallback: en });
  assert.equal(t('a.hello', { name: 'Aria' }), 'Hi Aria');
  assert.equal(t('a.hello'), 'Hi {name}');
  assert.equal(interpolate('{x} {y}', { x: 0 }), '0 {y}');
});

test('missing keys fall back to English, then to the key itself', () => {
  const t = createTranslator({ locale: 'es', messages: { 'a.hello': 'Hola {name}' }, fallback: en });
  assert.equal(t('a.hello', { name: 'Aria' }), 'Hola Aria');
  assert.equal(t('a.only'), 'Only English');
  assert.equal(t('nope.key'), 'nope.key');
});

test('plural forms use Intl.PluralRules', () => {
  const t = createTranslator({ fallback: en });
  assert.equal(t('a.left', { count: 1 }), 'You have 1 form left.');
  assert.equal(t('a.left', { count: 3 }), 'You have 3 forms left.');
  const ar = createTranslator({
    locale: 'ar',
    messages: { 'a.left.zero': 'صفر', 'a.left.one': 'واحد {count}', 'a.left.two': 'اثنان {count}', 'a.left.few': 'قليل {count}', 'a.left.many': 'كثير {count}', 'a.left.other': 'آخر {count}' },
    fallback: en,
  });
  assert.equal(ar('a.left', { count: 2 }), 'اثنان 2');
  assert.equal(ar('a.left', { count: 5 }), 'قليل 5');
  assert.equal(ar('a.left', { count: 100 }), 'آخر 100');
});

test('a locale with a missing plural category falls back to its other form, then English', () => {
  const ko = createTranslator({ locale: 'ko', messages: { 'a.left.other': '{count}개' }, fallback: en });
  assert.equal(ko('a.left', { count: 1 }), '1개');
  const partial = createTranslator({ locale: 'es', messages: {}, fallback: en });
  assert.equal(partial('a.left', { count: 1 }), 'You have 1 form left.');
});

test('parts() lets a caller style one variable', () => {
  const t = createTranslator({ fallback: en });
  assert.deepEqual(t.parts('a.left', { count: 4 }), [
    { text: 'You have ' }, { text: '4', variable: 'count' }, { text: ' forms left.' },
  ]);
});

test('malformed locale data never throws', () => {
  for (const bad of [null, undefined, 42, 'x', [], { strings: null }, { strings: { a: 5, b: '' } }]) {
    const t = createTranslator({ locale: 'fr', messages: bad, fallback: en });
    assert.equal(t('a.only'), 'Only English');
  }
  assert.deepEqual(sanitizeMessages({ _meta: { x: 1 }, strings: { ok: 'yes', no: 3 } }), { ok: 'yes' });
});

test('flattenSource reads {text, note} entries', () => {
  assert.deepEqual(flattenSource({ _readme: 'x', k: { text: 'T', note: 'N' }, j: 'plain' }), { k: 'T', j: 'plain' });
});

test('language codes: stored, legacy and browser values', () => {
  assert.equal(normalizeLanguage('es'), 'es');
  assert.equal(normalizeLanguage('Spanish'), 'es');
  assert.equal(normalizeLanguage('Tagalog'), 'tl');
  assert.equal(normalizeLanguage('Filipino'), 'tl');
  assert.equal(normalizeLanguage('zh-CN'), 'zh');
  assert.equal(normalizeLanguage('pt-BR'), null);
  assert.equal(normalizeLanguage(''), null);
  assert.equal(normalizeLanguage(undefined), null);
  assert.equal(getLanguage('nonsense').code, 'en');
  assert.equal(LANGUAGES.length, 10);
  assert.equal(languageDir('ar'), 'rtl');
  assert.equal(languageDir('ja'), 'ltr');
});
