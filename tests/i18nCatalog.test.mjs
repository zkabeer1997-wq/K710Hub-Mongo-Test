import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NON_ENGLISH } from '../lib/i18n/languages.mjs';
import { placeholdersOf } from '../lib/i18n/catalogTools.mjs';
import { HEROES, KVK_ALLIANCES } from '../lib/playerCombatOptions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const en = readJson('i18n/en.json');
const keys = Object.keys(en).filter((k) => !k.startsWith('_'));

test('every English entry has text and a translator note', () => {
  assert.ok(keys.length > 50);
  for (const key of keys) {
    assert.equal(typeof en[key].text, 'string', key);
    assert.ok(en[key].text.length > 0, key);
    assert.ok(typeof en[key].note === 'string' && en[key].note.length >= 10, `${key} needs a note`);
  }
});

test('plural groups define an .other form', () => {
  for (const key of keys) {
    const m = /^(.*)\.(one|zero|two|few|many)$/.exec(key);
    if (m) assert.ok(en[`${m[1]}.other`], `${m[1]}.other missing`);
  }
});

test('locale files exist, are well formed and only use known keys with the same placeholders', () => {
  for (const code of NON_ENGLISH) {
    const file = readJson(`i18n/locales/${code}.json`);
    assert.equal(file._meta.language, code);
    assert.equal(typeof file._meta.reviewed, 'boolean');
    for (const [key, value] of Object.entries(file.strings)) {
      // Languages with more plural forms than English (Arabic: zero/two/few/many) add keys under an existing plural group.
      const plural = /^(.*)\.(zero|one|two|few|many|other)$/.exec(key);
      const base = en[key] || (plural && en[`${plural[1]}.other`]);
      assert.ok(base, `${code}: unknown key ${key}`);
      // Exact match, except plural forms may drop {count} when the number is spelled out ("one form").
      const want = placeholdersOf(base.text);
      const got = placeholdersOf(value);
      if (plural) assert.ok(got.every((p) => want.includes(p)), `${code}: unknown placeholder in ${key}`);
      else assert.deepEqual(got, want, `${code}: placeholders differ for ${key}`);
    }
  }
});

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === '.next') continue;
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(jsx?|mjs)$/.test(name)) yield full;
  }
}

test('every t("key") used in member/chrome code exists in the catalog', () => {
  const have = new Set(keys.flatMap((k) => [k, k.replace(/\.(one|zero|two|few|many|other)$/, '')]));
  const missing = [];
  const prefixes = [...new Set(keys.map((k) => k.split('.')[0]))].join('|');
  for (const dir of ['components', 'app', 'lib']) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      // Direct t('a.b') calls plus key tables such as { title: 'form.prep.title' } (prefix list from the catalog).
      for (const m of text.matchAll(new RegExp(`'((?:${prefixes})\\.[a-zA-Z0-9_.]+)'`, 'g'))) {
        if (!have.has(m[1])) missing.push(`${path.relative(ROOT, file)}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('glossary keeps game proper nouns in English', () => {
  const glossary = readJson('i18n/glossary.json');
  const all = new Set(Object.entries(glossary).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v));
  for (const term of ['K710', 'KvK', 'Chief Minister', 'Noble Advisor', 'Flamedragon Tyrant', 'Power Profile', 'Garrison', 'Joiner', 'Rally', 'TG', 'T11', 'Mythic', 'Legendary', 'Gift Code']) {
    assert.ok(all.has(term), `glossary is missing ${term}`);
  }
  for (const name of [...HEROES, ...KVK_ALLIANCES]) assert.ok(all.has(name), `glossary is missing ${name}`);
});
