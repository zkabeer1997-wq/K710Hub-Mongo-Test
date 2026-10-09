#!/usr/bin/env node
// Pre-warm the runtime translation cache so first visitors never wait.
//
//   npm run translate:warm -- --dry-run                counts + estimated characters, never calls the API
//   npm run translate:warm                             crawl http://localhost:3000, translate every new string, all 9 languages
//   npm run translate:warm -- --base https://your-site --lang es,fr
//   npm run translate:warm -- --path /guides/some-guide --path /events/some-event     extra pages
//   npm run translate:warm -- --member-id 920000003    also crawl member pages (dev/test database only)
//   npm run translate:warm -- --cookie "k710_member_session=..."                       member pages with your own session
//   npm run translate:warm -- --reuse                  skip the crawl, use the units saved by the last run
//
// It opens the site in a headless browser (Playwright, already a dev dependency), reads the very same
// "units" the in-page overlay would translate (window.__k710i18n.collect), and sends the ones that are
// not cached yet to Google through lib/i18n/serverTranslate.mjs, which writes the shared Mongo cache.
// Re-runs only pay for new or changed text. The daily budget does not apply here (you started it).
//
// Needs, in the environment or .env.local: MONGODB_URI (+ MONGODB_DB_NAME), GOOGLE_TRANSLATE_API_KEY.
// Neither value is ever printed. GOOGLE_TRANSLATE_ENDPOINT may point at the mock server.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineFor, redactSecrets, resolveEndpoint } from '../lib/i18n/catalogTools.mjs';
import { LANGUAGES, NON_ENGLISH } from '../lib/i18n/languages.mjs';
import { RUNTIME_LIMITS } from '../lib/i18n/units.mjs';
import { cacheCollectionFor, cacheKey, translateUnits } from '../lib/i18n/serverTranslate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITS_FILE = path.join(ROOT, '.data/translate-units.json');
const PRICE_PER_MILLION = 20; // USD, Google Cloud Translation Basic (v2) list price

function loadEnvFile() {
  const env = {};
  try {
    for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch { /* no .env.local: the shell environment must provide everything */ }
  return env;
}

function parseArgs(argv) {
  const a = { langs: [], dryRun: false, base: process.env.WARM_BASE || 'http://localhost:3000', paths: [], maxPages: 400, reuse: false, memberId: null, cookie: null, noCrawl: false };
  for (let i = 0; i < argv.length; i += 1) {
    const x = argv[i];
    if (x === '--dry-run') a.dryRun = true;
    else if (x === '--lang') a.langs.push(...argv[(i += 1)].split(','));
    else if (x === '--base') a.base = argv[(i += 1)];
    else if (x === '--path') a.paths.push(argv[(i += 1)]);
    else if (x === '--max-pages') a.maxPages = Number(argv[(i += 1)]);
    else if (x === '--reuse') a.reuse = true;
    else if (x === '--member-id') a.memberId = argv[(i += 1)];
    else if (x === '--cookie') a.cookie = argv[(i += 1)];
    else if (x === '--no-crawl') a.noCrawl = true;
    else { console.error(`Unknown option: ${x}`); process.exit(2); }
  }
  return a;
}

/** Page routes from the app directory (admin and api excluded); dynamic ones are found by following links. */
function staticRoutes() {
  const routes = [];
  const walk = (dir, route) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith('_') || name === 'api' || name === 'admin') continue;
        walk(full, name.startsWith('(') ? route : `${route}/${name}`);
      } else if (/^page\.(js|jsx)$/.test(name) && !route.includes('[')) routes.push(route || '/');
    }
  };
  walk(path.join(ROOT, 'app'), '');
  return routes;
}

function catalogEnglish() {
  try {
    const en = JSON.parse(readFileSync(path.join(ROOT, 'i18n/en.json'), 'utf8'));
    return new Set(Object.entries(en).filter(([k, v]) => !k.startsWith('_') && v?.text && !/\{/.test(v.text)).map(([, v]) => v.text.replace(/\s+/g, ' ').trim()));
  } catch { return new Set(); }
}

async function crawl(args, env) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
  const base = new URL(args.base);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let cookie = args.cookie;
  if (!cookie && args.memberId) {
    const { memberCookie } = await import('./dev/qa-lib.mjs');
    cookie = memberCookie(args.memberId, env);
  }
  if (cookie) {
    for (const part of cookie.split(/;\s*/)) {
      const [name, ...v] = part.split('=');
      if (name) await context.addCookies([{ name, value: v.join('='), domain: base.hostname, path: '/' }]);
    }
  }
  await context.addInitScript(() => { try { localStorage.setItem('k710-language-v1', 'en'); sessionStorage.setItem('k710-forge-seen', '1'); sessionStorage.setItem('k710-forge-seen-v2', '1'); } catch { /* */ } });
  const page = await context.newPage();
  const queue = [...new Set([...staticRoutes(), ...args.paths])];
  const seen = new Set(queue);
  const units = new Map(); // key -> {pages:Set}
  const visited = [];
  while (queue.length && visited.length < args.maxPages) {
    const route = queue.shift();
    try {
      const resp = await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(600);
      const final = new URL(page.url());
      if (!resp || resp.status() >= 400 || final.origin !== base.origin) { console.log(`  skip ${route} (HTTP ${resp?.status() ?? 'none'})`); continue; }
      if (/^\/(login|gate|admin)/.test(final.pathname) && !/^\/(login|gate)/.test(route)) { console.log(`  skip ${route} (needs sign-in; use --cookie or --member-id)`); continue; }
      const found = await page.evaluate(() => (window.__k710i18n ? window.__k710i18n.collect() : null));
      if (!found) { console.log(`  skip ${route} (overlay not present)`); continue; }
      for (const u of found) { if (!units.has(u.key)) units.set(u.key, new Set()); units.get(u.key).add(route); }
      visited.push(route);
      const links = await page.$$eval('a[href]', (as) => as.map((x) => x.getAttribute('href')));
      for (const href of links) {
        let url;
        try { url = new URL(href, base); } catch { continue; }
        if (url.origin !== base.origin || /^\/(admin|api|_next)/.test(url.pathname) || /\.[a-z0-9]{2,4}$/i.test(url.pathname)) continue;
        if (!seen.has(url.pathname)) { seen.add(url.pathname); queue.push(url.pathname); }
      }
      console.log(`  ${route}: ${found.length} units (${units.size} unique so far)`);
    } catch (error) {
      console.log(`  skip ${route} (${redactSecrets(error.message).slice(0, 80)})`);
    }
  }
  await browser.close();
  return { pages: visited, units: [...units.keys()] };
}

async function openMongo(env) {
  const uri = env.MONGODB_URI || env.MONGO_URI;
  if (!uri) return null;
  const require = createRequire(import.meta.url);
  const { MongoClient } = require(path.join(ROOT, 'node_modules/mongodb'));
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(env.MONGODB_DB_NAME || 'k710hub');
  return { client, getCollection: async (name) => db.collection(name) };
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileEnv = loadEnvFile();
  const env = { ...fileEnv, ...process.env };
  const langs = args.langs.length ? args.langs : NON_ENGLISH;
  for (const code of langs) if (!NON_ENGLISH.includes(code)) { console.error(`Unknown language "${code}". Use: ${NON_ENGLISH.join(', ')}`); process.exit(2); }
  const endpoint = resolveEndpoint(env);
  const engine = engineFor(endpoint);

  let units;
  if (args.reuse) {
    units = JSON.parse(readFileSync(UNITS_FILE, 'utf8')).units;
    console.log(`Reusing ${units.length} saved units from .data/translate-units.json`);
  } else {
    console.log(`Crawling ${args.base} ...`);
    const result = await crawl(args, env);
    units = result.units;
    mkdirSync(path.dirname(UNITS_FILE), { recursive: true });
    writeFileSync(UNITS_FILE, JSON.stringify({ base: args.base, crawledAt: new Date().toISOString(), pages: result.pages, units }, null, 1));
    console.log(`Crawled ${result.pages.length} pages, ${units.length} unique units.`);
  }
  const inCatalog = catalogEnglish();
  units = units.filter((u) => !inCatalog.has(u.replace(/<\/?x\d+>/g, '').replace(/\s+/g, ' ').trim()));
  units = units.filter((u) => u.length <= RUNTIME_LIMITS.maxCharsPerString);

  const mongo = await openMongo(env).catch((error) => { console.error(`Cannot reach MongoDB (${redactSecrets(error.message).slice(0, 100)}); counting everything as uncached.`); return null; });
  const getCollection = mongo?.getCollection || (async () => { throw new Error('no database'); });
  const apiKey = env.GOOGLE_TRANSLATE_API_KEY || '';
  if (!args.dryRun && !apiKey) { console.error('GOOGLE_TRANSLATE_API_KEY is not set (environment or .env.local). Use --dry-run to preview without a key.'); process.exit(1); }
  if (!args.dryRun && !mongo) { console.error('MONGODB_URI is not set: nothing could be cached, so nothing would be saved. Stopping.'); process.exit(1); }
  console.log(`Engine: ${engine}${engine === 'mock' ? ' (MOCK: output goes to translation_cache_mock and is never served to real visitors)' : ''}\n`);

  let totalChars = 0;
  let totalNew = 0;
  for (const code of langs) {
    const name = LANGUAGES.find((l) => l.code === code).english;
    // Which units are cached / overridden already?
    const keys = units.map((u) => cacheKey(code, u));
    const have = new Set();
    try {
      const rows = [];
      for (const coll of [cacheCollectionFor(engine), 'translation_overrides']) {
        const c = await getCollection(coll);
        for (let i = 0; i < keys.length; i += 1000) rows.push(...await c.find({ _id: { $in: keys.slice(i, i + 1000) } }, { projection: { _id: 1 } }).toArray());
      }
      for (const r of rows) have.add(r._id);
    } catch { /* no db: everything counts as new */ }
    const todo = units.filter((_, i) => !have.has(keys[i]));
    const chars = todo.reduce((n, u) => n + u.length, 0);
    totalChars += chars;
    totalNew += todo.length;
    console.log(`${code} (${name}): ${units.length} units, ${units.length - todo.length} cached, ${todo.length} to translate, ~${chars} characters (~$${((chars / 1e6) * PRICE_PER_MILLION).toFixed(2)})`);
    if (args.dryRun || !todo.length) continue;
    let done = 0;
    let failed = 0;
    for (let i = 0; i < todo.length;) {
      const batch = [];
      let size = 0;
      while (i < todo.length && batch.length < RUNTIME_LIMITS.maxStringsPerRequest && size + todo[i].length <= RUNTIME_LIMITS.maxCharsPerRequest) { batch.push(todo[i]); size += todo[i].length; i += 1; }
      const result = await translateUnits({ lang: code, strings: batch, glossary: JSON.parse(readFileSync(path.join(ROOT, 'i18n/glossary.json'), 'utf8')), getCollection, apiKey, endpoint, enforceBudget: false });
      done += result.translations.filter(Boolean).length;
      failed += result.translations.filter((t) => !t).length;
      if (result.status === 'unavailable') {
        console.error(`  ${code}: the translation API refused the request: ${result.stats.error || 'unknown error'}${result.stats.httpStatus ? ` (HTTP ${result.stats.httpStatus})` : ''}`);
        console.error('  Stopping. Fix the key/restrictions and run again: finished work is already cached.');
        await mongo?.client.close();
        process.exit(1);
      }
      process.stdout.write(`\r  ${code}: ${done}/${todo.length}${failed ? ` (${failed} left in English)` : ''}   `);
    }
    process.stdout.write('\n');
  }
  console.log(args.dryRun
    ? `\nDry run: no API call made. ${totalNew} strings, about ${totalChars} characters (~$${((totalChars / 1e6) * PRICE_PER_MILLION).toFixed(2)} at list price) would be sent.`
    : '\nDone. Re-running only translates new or changed text.');
  await mongo?.client.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(redactSecrets(error.message)); process.exit(1); });
}
