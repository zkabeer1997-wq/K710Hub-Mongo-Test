import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createFakeMongo } from './helpers/fakeMongo.mjs';
import {
  BUDGET_COLLECTION, CACHE_COLLECTION, MOCK_CACHE_COLLECTION, OVERRIDES_COLLECTION, budgetUsed, cacheKey, maskUnit, restoreUnit, translateUnits, validateRequest,
} from '../lib/i18n/serverTranslate.mjs';
import { buildMatcher, engineFor, glossaryTerms, redactSecrets, resolveEndpoint, callTranslate } from '../lib/i18n/catalogTools.mjs';
import { handleTranslate } from '../lib/i18n/translateRoute.mjs';
import { COLLECTIONS } from '../lib/mongoCollections.js';
import { mockTranslateHtml } from '../scripts/dev/mock-translate-server.mjs';

const glossary = JSON.parse(readFileSync(new URL('../i18n/glossary.json', import.meta.url), 'utf8'));
const REAL = 'https://translation.googleapis.com/language/translate/v2';
const MOCK = 'http://127.0.0.1:4455/language/translate/v2';

/** A fake Google: wraps the (masked) html, keeps spans/tags like the real API, records every call. */
function fakeFetch(calls, { status = 200 } = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    if (status !== 200) {
      return new Response(JSON.stringify({ error: { code: status, message: 'Requests from referer <empty> are blocked.', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } }), { status });
    }
    return new Response(JSON.stringify({ data: { translations: body.q.map((q) => ({ translatedText: mockTranslateHtml(q, body.target) })) } }), { status: 200 });
  };
}
const setup = () => {
  const tables = {};
  return { tables, getCollection: createFakeMongo(tables).getCollection };
};

test('cacheKey is sha256(lang + normalized text): language and whitespace aware', () => {
  assert.match(cacheKey('es', 'Save'), /^[0-9a-f]{64}$/);
  assert.equal(cacheKey('es', ' Save '), cacheKey('es', 'Save'));
  assert.notEqual(cacheKey('es', 'Save'), cacheKey('fr', 'Save'));
});

test('masking protects glossary terms, numbers stay, placeholders are verified', () => {
  const matcher = buildMatcher(glossaryTerms(glossary));
  const masked = maskUnit('Join <x1>KvK</x1> & Kingshot now, {name}', matcher);
  assert.match(masked, /<x1><span class="notranslate" translate="no">KvK<\/span><\/x1>/);
  assert.match(masked, /&amp; <span class="notranslate" translate="no">Kingshot<\/span>/);
  assert.match(masked, /<span class="notranslate" translate="no">\{name\}<\/span>/);
  assert.equal(restoreUnit('Unete a <x1><span class="notranslate" translate="no">KvK</span></x1> &amp; <span translate="no">Kingshot</span> ya, <span>{name}</span>', 'Join <x1>KvK</x1> & Kingshot now, {name}'), 'Unete a <x1>KvK</x1> &amp; Kingshot ya, {name}');
  assert.equal(restoreUnit('Unete <x1>KvK ya', 'Join <x1>KvK</x1> now'), null, 'broken markup');
  assert.equal(restoreUnit('Hola {nombre}', 'Hello {name}'), null, 'mangled placeholder');
  assert.equal(restoreUnit('   ', 'Hello'), null);
});

test('validateRequest enforces languages and limits', () => {
  assert.ok(validateRequest({ lang: 'es', strings: ['a'] }).lang);
  assert.ok(validateRequest({ lang: 'en', strings: ['a'] }).error, 'English is not a target');
  assert.ok(validateRequest({ lang: 'xx', strings: ['a'] }).error);
  assert.ok(validateRequest({ lang: 'es', strings: [] }).error);
  assert.ok(validateRequest({ lang: 'es', strings: Array(61).fill('a') }).error);
  assert.ok(validateRequest({ lang: 'es', strings: ['x'.repeat(2001)] }).error);
  assert.ok(validateRequest({ lang: 'es', strings: Array(7).fill('x'.repeat(1900)) }).error, 'per-request character cap');
  assert.ok(validateRequest({ lang: 'es', strings: [5] }).error);
});

test('misses call the API once, are cached, and the second request makes no API call', async () => {
  const { tables, getCollection } = setup();
  const calls = [];
  const args = { lang: 'es', strings: ['Save changes', 'Open KvK forms'], glossary, getCollection, fetchImpl: fakeFetch(calls), apiKey: 'k', endpoint: REAL };
  const first = await translateUnits(args);
  assert.equal(first.status, 'ok');
  assert.equal(first.engine, 'google');
  assert.match(first.translations[0], /^\[es Español\] Save changes/);
  assert.match(first.translations[1], /KvK/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.source, 'en');
  assert.equal(calls[0].body.format, 'html');
  assert.equal(calls[0].headers['X-goog-api-key'], 'k', 'key travels in a header, never the url');
  assert.ok(!calls[0].url.includes('k=') && !calls[0].url.includes('key'));
  assert.equal(tables[CACHE_COLLECTION].length, 2);
  const second = await translateUnits(args);
  assert.deepEqual(second.translations, first.translations);
  assert.equal(calls.length, 1, 'cache hit: no second API call');
  assert.equal(second.stats.cache, 2);
});

test('a human override always beats cache and machine output', async () => {
  const { tables, getCollection } = setup();
  tables[OVERRIDES_COLLECTION] = [{ _id: cacheKey('es', 'Save changes'), lang: 'es', text: 'Guardar cambios' }];
  tables[CACHE_COLLECTION] = [{ _id: cacheKey('es', 'Save changes'), lang: 'es', text: 'machine version' }];
  const calls = [];
  const out = await translateUnits({ lang: 'es', strings: ['Save changes'], glossary, getCollection, fetchImpl: fakeFetch(calls), apiKey: 'k', endpoint: REAL });
  assert.equal(out.translations[0], 'Guardar cambios');
  assert.equal(calls.length, 0);
  assert.equal(out.stats.override, 1);
});

test('MOCK output can never be served as real: separate collection, separate reads', async () => {
  const { tables, getCollection } = setup();
  const calls = [];
  const common = { lang: 'fr', strings: ['Hello world'], glossary, getCollection, fetchImpl: fakeFetch(calls), apiKey: 'mock' };
  const viaMock = await translateUnits({ ...common, endpoint: MOCK });
  assert.equal(viaMock.engine, 'mock');
  assert.equal(tables[MOCK_CACHE_COLLECTION].length, 1);
  assert.equal(tables[CACHE_COLLECTION], undefined, 'real cache untouched by mock output');
  // A production-style request (real endpoint) must not read the mock entry: it calls the API itself.
  const viaReal = await translateUnits({ ...common, endpoint: REAL });
  assert.equal(viaReal.engine, 'google');
  assert.equal(calls.length, 2, 'the real engine did not reuse the mock cache');
  assert.equal(tables[CACHE_COLLECTION].length, 1);
  assert.equal(COLLECTIONS.TRANSLATION_CACHE, CACHE_COLLECTION);
  assert.equal(COLLECTIONS.TRANSLATION_CACHE_MOCK, MOCK_CACHE_COLLECTION);
  assert.equal(engineFor(REAL), 'google');
  assert.equal(engineFor(MOCK), 'mock');
  assert.equal(engineFor('not a url'), 'mock');
  assert.equal(resolveEndpoint({}), REAL);
  assert.equal(resolveEndpoint({ GOOGLE_TRANSLATE_ENDPOINT: MOCK }), MOCK);
});

test('the daily budget caps API spend, then answers from cache only and fails soft', async () => {
  const { tables, getCollection } = setup();
  const calls = [];
  const base = { lang: 'tr', glossary, getCollection, fetchImpl: fakeFetch(calls), apiKey: 'k', endpoint: REAL, budget: 40, now: Date.parse('2026-10-09T10:00:00Z') };
  const a = await translateUnits({ ...base, strings: ['Short text'] });
  assert.equal(a.status, 'ok');
  assert.ok(await budgetUsed({ getCollection, engine: 'google', now: base.now }) >= 10);
  const b = await translateUnits({ ...base, strings: ['This second sentence is long enough to exceed what is left of the budget'] });
  assert.equal(b.status, 'budget');
  assert.deepEqual(b.translations, [null]);
  assert.equal(calls.length, 1, 'no API call once over budget');
  const again = await translateUnits({ ...base, strings: ['Short text'] });
  assert.equal(again.status, 'ok', 'cached text keeps working over budget');
  assert.equal(tables[BUDGET_COLLECTION].length, 1);
  // next day starts from zero
  const next = await translateUnits({ ...base, now: base.now + 864e5, strings: ['This second sentence is long enough to exceed what is left of the budget'], budget: 500 });
  assert.equal(next.status, 'ok');
});

test('a failing provider never throws: strings come back null and the error is redacted', async () => {
  const { getCollection } = setup();
  const out = await translateUnits({ lang: 'ja', strings: ['Hello'], glossary, getCollection, fetchImpl: fakeFetch([], { status: 403 }), apiKey: 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12345', endpoint: REAL });
  assert.equal(out.status, 'unavailable');
  assert.deepEqual(out.translations, [null]);
  assert.equal(out.stats.httpStatus, 403);
  assert.match(out.stats.error, /API_KEY_HTTP_REFERRER_BLOCKED/);
  assert.ok(!/AIza/.test(JSON.stringify(out)));
  const none = await translateUnits({ lang: 'ja', strings: ['Hello'], glossary, getCollection, fetchImpl: fakeFetch([]), apiKey: '', endpoint: REAL });
  assert.equal(none.status, 'unavailable');
});

test('the CLI explains a 403 with Google\'s reason and never prints the key', async () => {
  await assert.rejects(
    callTranslate({ texts: ['a'], target: 'es', apiKey: 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12345', endpoint: REAL, fetchImpl: fakeFetch([], { status: 403 }), retries: 0 }),
    (error) => /HTTP 403/.test(error.message) && /API_KEY_HTTP_REFERRER_BLOCKED/.test(error.message) && !/AIza/.test(error.message),
  );
  assert.equal(redactSecrets('https://x/?key=AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12345&a=1'), 'https://x/?key=[redacted]&a=1');
});

const req = (body, headers = {}) => new Request('http://localhost:3105/api/translate', {
  method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3105', origin: 'http://localhost:3105', ...headers }, body: JSON.stringify(body),
});

test('route: same-origin only, validates, rate limits, answers 200 even when the provider is down', async () => {
  const { getCollection } = setup();
  const calls = [];
  const deps = { glossary, getCollection, fetchImpl: fakeFetch(calls), env: { GOOGLE_TRANSLATE_API_KEY: 'k' }, rateLimit: async () => false };
  const ok = await handleTranslate(req({ lang: 'ko', strings: ['Welcome back'] }), deps);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.status, 'ok');
  assert.match(data.translations[0], /^\[ko 한국어\] Welcome back/);
  assert.equal(JSON.stringify(data).includes('"k"'), false);

  assert.equal((await handleTranslate(req({ lang: 'ko', strings: ['x y'] }, { origin: 'https://evil.example' }), deps)).status, 403);
  assert.equal((await handleTranslate(req({ lang: 'ko', strings: ['x y'] }, { 'sec-fetch-site': 'cross-site' }), deps)).status, 403);
  const bare = new Request('http://localhost:3105/api/translate', { method: 'POST', headers: { host: 'localhost:3105', 'content-type': 'application/json' }, body: JSON.stringify({ lang: 'ko', strings: ['x y'] }) });
  assert.equal((await handleTranslate(bare, deps)).status, 403, 'no Origin and not same-origin: not our page');
  assert.equal((await handleTranslate(req({ lang: 'en', strings: ['x y'] }), deps)).status, 400);
  assert.equal((await handleTranslate(req({ lang: 'ko', strings: 'nope' }), deps)).status, 400);
  const limited = await handleTranslate(req({ lang: 'ko', strings: ['x y'] }), { ...deps, rateLimit: async () => true });
  assert.equal(limited.status, 429);

  const down = await handleTranslate(req({ lang: 'ko', strings: ['Never cached text'] }), { ...deps, fetchImpl: fakeFetch([], { status: 500 }) });
  assert.equal(down.status, 200);
  const downData = await down.json();
  assert.equal(downData.status, 'unavailable');
  assert.deepEqual(downData.translations, [null]);
  const noKey = await handleTranslate(req({ lang: 'ko', strings: ['Other text here'] }), { ...deps, env: {} });
  assert.equal((await noKey.json()).status, 'unavailable');
});
