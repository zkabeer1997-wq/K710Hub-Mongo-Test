import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMatcher, callTranslate, decodeEntities, diffCatalog, estimateChars, glossaryTerms, hashText,
  makeBatches, maskText, parseCsv, restoreText, toCsv, translateKeys,
} from '../lib/i18n/catalogTools.mjs';

const glossary = { game: ['KvK', 'Noble Advisor', 'Power Profile', 'TG'], heroes: ['Amane'] };
const matcher = buildMatcher(glossaryTerms(glossary));

test('masking wraps glossary terms and placeholders, escaping HTML', () => {
  const html = maskText('Hi {name}, fill the KvK Noble Advisor form & TG8', matcher);
  assert.match(html, /<span class="notranslate" translate="no">\{name\}<\/span>/);
  assert.match(html, /<span class="notranslate" translate="no">KvK<\/span>/);
  assert.match(html, /<span class="notranslate" translate="no">Noble Advisor<\/span>/);
  assert.match(html, /&amp;/);
  // TG inside TG8 is not a whole word, so it is not masked.
  assert.doesNotMatch(html, />TG</);
});

test('longest glossary term wins and words are not matched inside longer words', () => {
  const html = maskText('Power Profile and KvKing', matcher);
  assert.equal((html.match(/notranslate/g) || []).length, 1);
});

test('restore strips spans, decodes entities and checks placeholders', () => {
  const original = 'Hi {name}, you have {count} forms';
  assert.equal(
    restoreText('Hola <span class="notranslate" translate="no">{name}</span>, tienes <span translate="no">{count}</span> formularios &amp; m&#225;s', original),
    'Hola {name}, tienes {count} formularios & más',
  );
  assert.equal(restoreText('Hola {nombre}, tienes {count}', original), null);
  assert.equal(restoreText('Hola {name}', original), null);
  assert.equal(restoreText('', original), null);
  assert.equal(restoreText(undefined, original), null);
  assert.equal(decodeEntities('&#39;a&#x27; &lt;b&gt; &quot;'), "'a' <b> \"");
});

test('diff: new keys, changed English, unchanged keys and removed keys', () => {
  const source = { a: { text: 'One' }, b: { text: 'Two v2' }, c: { text: 'Three' }, d: { text: 'Four' } };
  const existing = { a: 'Uno', b: 'Dos', c: 'Tres', zz: 'Old' };
  const manifest = { a: hashText('One'), b: hashText('Two'), c: hashText('Three') };
  const diff = diffCatalog(source, existing, manifest);
  assert.deepEqual(diff.todo.sort(), ['b', 'd']);
  assert.deepEqual(diff.stale, ['b']);
  assert.deepEqual(diff.keep.sort(), ['a', 'c']);
  assert.deepEqual(diff.removed, ['zz']);
});

test('a hand-edited translation is kept while the English text is unchanged', () => {
  const source = { a: { text: 'One' } };
  const diff = diffCatalog(source, { a: 'Edited by reviewer' }, { a: hashText('One') });
  assert.deepEqual(diff.todo, []);
});

test('batches respect both the query count and the character limit and keep order', () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ key: `k${i}`, text: 'x'.repeat(10) }));
  const batches = makeBatches(items, { maxQueries: 100, maxChars: 100000 });
  assert.deepEqual(batches.map((b) => b.length), [100, 100, 50]);
  const big = makeBatches(Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, text: 'y'.repeat(400) })), { maxQueries: 100, maxChars: 1000 });
  assert.deepEqual(big.map((b) => b.length), [2, 2, 1]);
  assert.deepEqual(big.flat().map((b) => b.key), ['k0', 'k1', 'k2', 'k3', 'k4']);
});

function mockFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return handler(body, calls.length);
  };
  impl.calls = calls;
  return impl;
}
const ok = (body, mapper) => ({ ok: true, status: 200, json: async () => ({ data: { translations: body.q.map((q) => ({ translatedText: mapper(q) })) } }) });

test('translateKeys masks before sending and restores after, in batches', async () => {
  const source = { 'x.a': { text: 'Hi {name}' }, 'x.b': { text: 'Open the Power Profile' } };
  const fetchImpl = mockFetch((body) => ok(body, (q) => q.replace('Hi', 'Hola').replace('Open the', 'Abre el')));
  const { strings, failed } = await translateKeys({ keys: ['x.a', 'x.b'], source, target: 'es', glossary, apiKey: 'SECRET-KEY-VALUE', fetchImpl });
  assert.deepEqual(strings, { 'x.a': 'Hola {name}', 'x.b': 'Abre el Power Profile' });
  assert.deepEqual(failed, []);
  const [call] = fetchImpl.calls;
  assert.equal(call.body.target, 'es');
  assert.equal(call.body.source, 'en');
  assert.equal(call.body.format, 'html');
  assert.match(call.body.q[0], /<span class="notranslate" translate="no">\{name\}<\/span>/);
  // The key travels in a header, not in the URL or the body.
  assert.equal(call.init.headers['X-goog-api-key'], 'SECRET-KEY-VALUE');
  assert.doesNotMatch(call.url, /SECRET/);
  assert.doesNotMatch(JSON.stringify(call.body), /SECRET/);
});

test('a string whose placeholder is damaged is reported and not written', async () => {
  const source = { a: { text: 'Hi {name}' }, b: { text: 'Plain' } };
  const fetchImpl = mockFetch((body) => ok(body, (q) => (q.includes('name') ? 'Hola {nombre}' : 'Llano')));
  const { strings, failed } = await translateKeys({ keys: ['a', 'b'], source, target: 'es', glossary, apiKey: 'k', fetchImpl });
  assert.deepEqual(strings, { b: 'Llano' });
  assert.deepEqual(failed, ['a']);
});

test('retries on 429 and 5xx, then reports only the status (never the key)', async () => {
  let n = 0;
  const flaky = mockFetch((body) => (++n < 3 ? { ok: false, status: 429, json: async () => ({}) } : ok(body, (q) => q.toUpperCase())));
  const sleeps = [];
  const out = await callTranslate({ texts: ['a'], target: 'fr', apiKey: 'k', fetchImpl: flaky, sleep: async (ms) => sleeps.push(ms) });
  assert.deepEqual(out, ['A']);
  assert.deepEqual(sleeps, [1000, 2000]);

  const dead = mockFetch(() => ({ ok: false, status: 403, json: async () => ({ error: 'bad SECRET-KEY-VALUE' }) }));
  await assert.rejects(
    () => callTranslate({ texts: ['a'], target: 'fr', apiKey: 'SECRET-KEY-VALUE', fetchImpl: dead, sleep: async () => {} }),
    (error) => /HTTP 403/.test(error.message) && !/SECRET/.test(error.message),
  );
  assert.equal(dead.calls.length, 1);
});

test('estimate counts masked characters and a dry run needs no API', () => {
  const chars = estimateChars(['a'], { a: { text: 'Hi' } }, glossary);
  assert.equal(chars, 2);
});

test('review CSV round trips quotes, commas and newlines', () => {
  const rows = [['key', 'note', 'English', 'es'], ['k', 'has, comma', 'say "hi"\nnext line', 'di "hola"']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
  assert.deepEqual(parseCsv(`﻿${toCsv(rows)}`), rows);
});
