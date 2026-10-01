import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectTerms, restoreTerms, translateWithProtectedTerms, PROTECTED_TERMS } from '../lib/i18nTerms.mjs';
import { languageShortCode, QUICK_LANGUAGES, SUGGESTED_LANGUAGES, isEnglish } from '../lib/i18nLanguages.mjs';

test('protects game terms, longest first, only as whole words', () => {
  const { text, terms } = protectTerms('Update your Governor Gear for KvK. TG and TTG count; TGIF and mTG do not.');
  assert.deepEqual(terms, ['Governor Gear', 'KvK', 'TG', 'TTG']);
  assert.equal(text, 'Update your [[0]] for [[1]]. [[2]] and [[3]] count; TGIF and mTG do not.');
  assert.deepEqual(protectTerms('Flamedragon Tyrant and Noble Advisor').terms, ['Flamedragon Tyrant', 'Noble Advisor']);
  assert.equal(protectTerms('plain text').text, 'plain text');
  assert.equal(protectTerms('KvK', false).text, 'KvK');
});

test('restore puts terms back, tolerates spacing, and fails closed on a lost placeholder', () => {
  assert.equal(restoreTerms('Aktualisiere [[0]] fuer [[ 1 ]].', ['Governor Gear', 'KvK']), 'Aktualisiere Governor Gear fuer KvK.');
  assert.equal(restoreTerms('Aktualisiere [[0]] fuer.', ['Governor Gear', 'KvK']), null);
});

test('admin translation for a term wins for that language only', () => {
  const overrides = { es: { 'Governor Gear': 'Equipo de Gobernador' } };
  assert.equal(restoreTerms('Mira [[0]]', ['Governor Gear'], 'es', overrides), 'Mira Equipo de Gobernador');
  assert.equal(restoreTerms('Voir [[0]]', ['Governor Gear'], 'fr', overrides), 'Voir Governor Gear');
});

test('translateWithProtectedTerms masks before translating and keeps English on damage', async () => {
  const seen = [];
  const fake = async (strings) => { seen.push(...strings); return strings.map((s) => `~${s}~`); };
  const out = await translateWithProtectedTerms(['Open KvK form', 'Hello'], fake, 'de');
  assert.deepEqual(seen, ['Open [[0]] form', 'Hello']);
  assert.deepEqual(out, ['~Open KvK form~', '~Hello~']);
  const damaging = async (strings) => strings.map(() => 'kaputt');
  assert.deepEqual(await translateWithProtectedTerms(['Open KvK form', 'Hello'], damaging, 'de'), ['Open KvK form', 'kaputt']);
});

test('term list includes the appointment vocabulary', () => {
  for (const term of ['KvK', 'TG', 'TTG', 'Noble Advisor', 'Chief Minister']) assert.ok(PROTECTED_TERMS.includes(term), term);
});

test('languageShortCode: header button code', () => {
  assert.equal(languageShortCode('English'), 'EN');
  assert.equal(languageShortCode('Español'), 'ES');
  assert.equal(languageShortCode('Chinese (Traditional)'), 'ZH-HANT');
  assert.equal(languageShortCode('Klingon'), 'KL');
  assert.equal(languageShortCode(''), 'EN');
  assert.ok(isEnglish('English'));
});

test('quick languages are all selectable languages', () => {
  const names = new Set(SUGGESTED_LANGUAGES.map(([n]) => n));
  for (const q of QUICK_LANGUAGES) assert.ok(names.has(q), q);
  assert.equal(QUICK_LANGUAGES[0], 'English');
});
