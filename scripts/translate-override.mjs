#!/usr/bin/env node
// Fix one machine translation by hand. Overrides always win over machine output.
//
//   npm run translate:override -- --lang es --text "Save changes" --to "Guardar cambios"
//   npm run translate:override -- --lang es --text "Save changes" --remove
//   npm run translate:override -- --list --lang es
//
// --text is the exact English the site shows (whitespace is ignored). Needs MONGODB_URI (+ MONGODB_DB_NAME)
// in the environment or .env.local. It also drops the cached machine version for that string.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NON_ENGLISH } from '../lib/i18n/languages.mjs';
import { CACHE_COLLECTION, OVERRIDES_COLLECTION, cacheKey } from '../lib/i18n/serverTranslate.mjs';
import { normalizeUnit } from '../lib/i18n/units.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const flag = (name) => process.argv.includes(name);

function env() {
  const out = {};
  try { for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); } } catch { /* none */ }
  return { ...out, ...process.env };
}

const lang = arg('--lang');
if (!NON_ENGLISH.includes(lang)) { console.error(`--lang must be one of: ${NON_ENGLISH.join(', ')}`); process.exit(2); }
const e = env();
const uri = e.MONGODB_URI || e.MONGO_URI;
if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
const require = createRequire(import.meta.url);
const { MongoClient } = require(path.join(ROOT, 'node_modules/mongodb'));
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
await client.connect();
const db = client.db(e.MONGODB_DB_NAME || 'k710hub');
try {
  const overrides = db.collection(OVERRIDES_COLLECTION);
  if (flag('--list')) {
    for (const row of await overrides.find({ lang }).limit(500).toArray()) console.log(`${row.source}\n  -> ${row.text}`);
  } else {
    const text = arg('--text');
    if (!text) { console.error('--text "English text" is required'); process.exit(2); }
    const key = cacheKey(lang, text);
    if (flag('--remove')) {
      await overrides.deleteOne({ _id: key });
      console.log('Override removed.');
    } else {
      const to = arg('--to');
      if (!to) { console.error('--to "translation" is required'); process.exit(2); }
      await overrides.updateOne({ _id: key }, { $set: { lang, source: normalizeUnit(text), text: to, updated_at: new Date() } }, { upsert: true });
      await db.collection(CACHE_COLLECTION).deleteOne({ _id: key });
      console.log(`Saved. Visitors who open a page in ${lang} will get it (their browsers may keep the old text for a while until the cache is cleared).`);
    }
  }
} finally {
  await client.close();
}
