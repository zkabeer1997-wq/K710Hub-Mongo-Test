#!/usr/bin/env node
// Machine-translate i18n/en.json into the nine other languages (Google Cloud Translation v2, Basic).
//
//   npm run translate -- --dry-run            counts + estimated characters, never calls the API
//   npm run translate                         every language, only new/changed keys
//   npm run translate -- --lang es            one language
//   npm run translate -- --review-csv es      write i18n/review/es.csv (English next to the translation)
//   npm run translate -- --import-csv es file.csv   apply a reviewer's edited CSV to i18n/locales/es.json
//
// The API key is read from GOOGLE_TRANSLATE_API_KEY (environment, or .env.local when unset). It is
// never printed or logged. See docs/translation.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffCatalog, estimateChars, hashText, parseCsv, toCsv, translateKeys,
} from '../lib/i18n/catalogTools.mjs';
import { LANGUAGES, NON_ENGLISH } from '../lib/i18n/languages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_FILE = path.join(ROOT, 'i18n/en.json');
const GLOSSARY_FILE = path.join(ROOT, 'i18n/glossary.json');
const MANIFEST_FILE = path.join(ROOT, 'i18n/translation-manifest.json');
const localeFile = (code) => path.join(ROOT, 'i18n/locales', `${code}.json`);

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// Same idea as scripts/dev/qa-lib.mjs loadEnv, but it only ever returns the one variable we need.
function loadApiKey() {
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return process.env.GOOGLE_TRANSLATE_API_KEY;
  try {
    for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^GOOGLE_TRANSLATE_API_KEY=(.*)$/);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch { /* no .env.local */ }
  return '';
}

function parseArgs(argv) {
  const args = { langs: [], dryRun: false, reviewCsv: null, importCsv: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--lang') args.langs.push(argv[(i += 1)]);
    else if (a.startsWith('--lang=')) args.langs.push(a.slice(7));
    else if (a === '--review-csv') args.reviewCsv = argv[(i += 1)];
    else if (a === '--import-csv') { args.importCsv = { lang: argv[(i += 1)], file: argv[(i += 1)] }; }
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }
  return args;
}

function readLocale(code) {
  const file = readJson(localeFile(code), null);
  const strings = file && typeof file.strings === 'object' && file.strings ? file.strings : {};
  return { meta: file?._meta || {}, strings };
}

function reviewCsv(code, source) {
  const { strings } = readLocale(code);
  const rows = [['key', 'note', 'English', `${code} (edit this column)`]];
  for (const [key, entry] of Object.entries(source)) {
    if (key.startsWith('_')) continue;
    rows.push([key, entry.note || '', entry.text, strings[key] || '']);
  }
  const dir = path.join(ROOT, 'i18n/review');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${code}.csv`);
  writeFileSync(out, `﻿${toCsv(rows)}`);
  console.log(`Wrote ${path.relative(ROOT, out)} (${rows.length - 1} rows). Open it in Excel or Google Sheets.`);
}

function importCsv({ lang, file }, source) {
  const rows = parseCsv(readFileSync(path.resolve(file), 'utf8')).slice(1);
  const { meta, strings } = readLocale(lang);
  const manifest = readJson(MANIFEST_FILE, {});
  let changed = 0;
  for (const [key, , , value] of rows) {
    if (!Object.hasOwn(source, key) || key.startsWith('_')) continue;
    const text = (value || '').trim();
    if (text && text !== strings[key]) {
      strings[key] = text;
      manifest[lang] = { ...(manifest[lang] || {}), [key]: hashText(source[key].text) };
      changed += 1;
    }
  }
  writeLocale(lang, source, strings, { ...meta, reviewed: meta.reviewed });
  writeJson(MANIFEST_FILE, manifest);
  console.log(`${lang}: applied ${changed} edited string(s). Set "reviewed": true in i18n/locales/${lang}.json once the language is checked.`);
}

function writeLocale(code, source, strings, meta) {
  const ordered = {};
  for (const key of Object.keys(source)) if (!key.startsWith('_') && strings[key]) ordered[key] = strings[key];
  writeJson(localeFile(code), {
    _meta: {
      language: code,
      status: !Object.keys(ordered).length ? 'stub' : meta.reviewed ? 'reviewed' : 'machine-translated, not yet reviewed by a person',
      machineTranslated: Object.keys(ordered).length > 0,
      reviewed: Boolean(meta.reviewed),
      engine: meta.engine || 'google-cloud-translation-v2',
      generatedAt: meta.generatedAt || new Date().toISOString(),
    },
    strings: ordered,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = readJson(SOURCE_FILE, null);
  if (!source) { console.error('Cannot read i18n/en.json'); process.exit(1); }
  const glossary = readJson(GLOSSARY_FILE, {});
  const known = new Set(NON_ENGLISH);

  if (args.reviewCsv) return reviewCsv(args.reviewCsv, source);
  if (args.importCsv) return importCsv(args.importCsv, source);

  const langs = args.langs.length ? args.langs : NON_ENGLISH;
  for (const code of langs) if (!known.has(code)) { console.error(`Unknown language "${code}". Use one of: ${NON_ENGLISH.join(', ')}`); process.exit(2); }

  const manifest = readJson(MANIFEST_FILE, {});
  const apiKey = args.dryRun ? '' : loadApiKey();
  if (!args.dryRun && !apiKey) {
    console.error('GOOGLE_TRANSLATE_API_KEY is not set (environment or .env.local). Run with --dry-run to preview without a key.');
    process.exit(1);
  }

  let totalChars = 0;
  for (const code of langs) {
    const { meta, strings } = readLocale(code);
    const diff = diffCatalog(source, strings, manifest[code] || {});
    const chars = estimateChars(diff.todo, source, glossary);
    totalChars += chars;
    const name = LANGUAGES.find((l) => l.code === code).english;
    console.log(`${code} (${name}): ${diff.todo.length} to translate (${diff.stale.length} changed), ${diff.keep.length} up to date, ${diff.removed.length} to remove, ~${chars} characters`);
    if (args.dryRun) continue;

    const next = { ...strings };
    for (const key of diff.removed) delete next[key];
    let failed = [];
    if (diff.todo.length) {
      const target = LANGUAGES.find((l) => l.code === code).google;
      const result = await translateKeys({
        keys: diff.todo, source, target, glossary, apiKey,
        onBatch: (n, of) => console.log(`  ${code}: batch ${n}/${of}`),
      });
      Object.assign(next, result.strings);
      failed = result.failed;
      manifest[code] = { ...(manifest[code] || {}) };
      for (const key of Object.keys(result.strings)) manifest[code][key] = hashText(source[key].text);
    }
    for (const key of diff.removed) if (manifest[code]) delete manifest[code][key];
    const addedAny = diff.todo.length > failed.length;
    writeLocale(code, source, next, {
      machineTranslated: true,
      // New machine text means the file is no longer fully reviewed.
      reviewed: addedAny ? false : meta.reviewed,
      generatedAt: addedAny ? new Date().toISOString() : meta.generatedAt,
    });
    if (failed.length) console.log(`  ${code}: ${failed.length} string(s) kept in English because a {placeholder} was damaged: ${failed.join(', ')}`);
  }
  if (args.dryRun) console.log(`\nDry run: no API call made. About ${totalChars} characters would be sent in total.`);
  else writeJson(MANIFEST_FILE, manifest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
export { main };
