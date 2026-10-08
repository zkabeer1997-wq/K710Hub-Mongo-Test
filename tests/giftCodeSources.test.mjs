import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './helpers/externalFakes.mjs';
import {
  GIFT_MAX_CODES,
  enabledGiftSources,
  extractJsonArray,
  mergeSourceResults,
  normalizeCode,
  normalizeEntries,
  parseKingshotMastery,
  parseKingshotNet,
  classifyFailure,
} from '../lib/external/giftCodeSources.mjs';
import { ExternalError } from '../lib/external/sanitize.mjs';

const NOW = Date.parse('2026-10-08T18:00:00Z');

test('kingshot.net parser reads the RSC payload: active only, expiry kept, expired and inactive dropped', () => {
  const r = parseKingshotNet(fixture('giftcodes-kingshot-net.html'), { now: NOW });
  assert.equal(r.via, 'payload');
  assert.deepEqual(r.codes.map((c) => c.code), ['WELLDONE', 'Kingshot888', 'VIP777']); // KS1005 expired 10-07, 84yQNP42a inactive
  assert.equal(r.codes[0].expires_at, '2026-10-10T23:59:00.000Z');
  assert.equal(r.codes[1].expires_at, null);
  assert.equal(r.codes[0].rewards, null); // "Not Specified Yet" is not a reward
  assert.ok(r.dropped >= 3);
  assert.ok(r.codes.every((c) => c.source === 'kingshot.net'));
});

test('kingshot.net falls back to the JSON-LD list when the payload is missing', () => {
  const r = parseKingshotNet(fixture('giftcodes-kingshot-net-jsonld-only.html'), { now: NOW });
  assert.equal(r.via, 'jsonld');
  assert.deepEqual(r.codes.map((c) => c.code), ['WELLDONE', 'Kingshot888', 'VIP777']);
});

test('kingshotmastery.com parser reads rewards, dates and the explicit expiry', () => {
  const r = parseKingshotMastery(fixture('giftcodes-kingshotmastery.html'), { now: NOW });
  assert.equal(r.via, 'payload');
  assert.deepEqual(r.codes.map((c) => c.code), ['WELLDONE', 'Kingshot888', 'VIP777']);
  assert.match(r.codes[1].rewards, /200 Gems/);
  assert.equal(r.codes[2].expires_at, '2026-12-31T23:59:59.000Z');
  assert.equal(r.codes[0].rewards, null);
  assert.equal(r.codes[1].added_at, '2026-08-17T00:00:00.000Z');
});

test('kingshotmastery.com JSON-LD fallback pulls rewards from the description', () => {
  const r = parseKingshotMastery(fixture('giftcodes-kingshotmastery-jsonld-only.html'), { now: NOW });
  assert.equal(r.via, 'jsonld');
  assert.match(r.codes[2].rewards, /Gold Keys/);
});

test('a changed page shape is reported as a shape error, never an empty success', () => {
  for (const parse of [parseKingshotNet, parseKingshotMastery]) {
    assert.throws(() => parse('<html><body>Totally different page</body></html>'), (e) => e.code === 'shape');
    assert.throws(() => parse(''), (e) => e.code === 'shape');
    assert.throws(() => parse(null), (e) => e.code === 'shape');
  }
});

test('normalizeCode keeps case, strips markup, enforces [A-Za-z0-9]{4,32}', () => {
  assert.equal(normalizeCode('  Kingshot888 '), 'Kingshot888');
  assert.equal(normalizeCode('<b>VIP777</b>'), 'VIP777');
  for (const bad of ['abc', 'a'.repeat(33), 'has space', 'KS-1005', 'café123', '<script>alert(1)</script>', '', null, undefined, 42, { a: 1 }, 'x\ny1234']) {
    assert.equal(normalizeCode(bad), null, String(bad));
  }
  assert.equal(normalizeCode('a'.repeat(32)), 'a'.repeat(32));
});

test('normalizeEntries dedupes case-insensitively, drops expired/inactive/garbage, caps the list', () => {
  const { codes, dropped } = normalizeEntries(
    [
      { code: 'Alpha1' }, { code: 'ALPHA1' }, { code: 'Beta22', active: false }, { code: 'Gamma3', expires_at: '2026-10-01' },
      { code: 'Delta4', expires_at: '2026-10-09', rewards: '<img src=x onerror=alert(1)> 100 Gems' }, 'junk', null, { code: '!!bad!!' },
    ],
    { source: 'kingshot.net', now: NOW },
  );
  assert.deepEqual(codes.map((c) => c.code), ['Alpha1', 'Delta4']);
  assert.ok(!/[<>]/.test(codes[1].rewards));
  assert.ok(dropped >= 4);
  const many = Array.from({ length: 250 }, (_, i) => ({ code: `CODE${1000 + i}` }));
  assert.equal(normalizeEntries(many, { source: 'kingshot.net', now: NOW }).codes.length, GIFT_MAX_CODES);
});

test('extractJsonArray survives brackets and escaped quotes inside strings', () => {
  const text = 'x"giftCodes":[{"code":"AB]CD","n":"a\\"]b"},{"code":"Zed99"}],"total":2';
  assert.equal(extractJsonArray(text, '"giftCodes":[').length, 2);
  assert.equal(extractJsonArray('nothing', '"giftCodes":['), null);
  assert.equal(extractJsonArray('"giftCodes":[{"a":', '"giftCodes":['), null);
});

test('merge: union by normalized code, primary spelling wins, expiry-bearing entry wins, sources recorded', () => {
  const merged = mergeSourceResults([
    { source: 'kingshot.net', codes: [{ code: 'Kingshot888', rewards: null, expires_at: null, added_at: '2026-08-17T00:00:00Z' }, { code: 'ONLYNET1', expires_at: null }] },
    { source: 'kingshotmastery.com', codes: [{ code: 'KINGSHOT888', rewards: '200 Gems', expires_at: '2026-12-31T23:59:59Z', added_at: '2026-08-10T00:00:00Z' }, { code: 'ONLYMAST2' }] },
  ]);
  assert.equal(merged.length, 3);
  const k = merged.find((m) => m.code === 'Kingshot888');
  assert.deepEqual(k.sources, ['kingshot.net', 'kingshotmastery.com']);
  assert.equal(k.expires_at, '2026-12-31T23:59:59Z');
  assert.equal(k.rewards, '200 Gems');
  assert.equal(k.added_at, '2026-08-10T00:00:00Z');
  assert.deepEqual(merged.find((m) => m.code === 'ONLYMAST2').sources, ['kingshotmastery.com']);
  assert.deepEqual(mergeSourceResults([]), []);
});

test('only kingshot.net is read automatically unless the owner opts in to kingshotmastery.com', () => {
  assert.deepEqual(enabledGiftSources({}).map((s) => s.id), ['kingshot.net']);
  assert.deepEqual(enabledGiftSources({ GIFT_ENABLE_KINGSHOTMASTERY: '1' }).map((s) => s.id), ['kingshot.net', 'kingshotmastery.com']);
});

test('failure classification', () => {
  assert.equal(classifyFailure(new ExternalError('http', 'Source refused automated access (403)')), 'blocked');
  assert.equal(classifyFailure(new ExternalError('http', 'HTTP 500')), 'failed');
  assert.equal(classifyFailure(new ExternalError('robots', 'robots.txt disallows /gift-codes')), 'robots');
  assert.equal(classifyFailure(new ExternalError('shape', 'x')), 'shape');
  assert.equal(classifyFailure(new ExternalError('timeout', 'x')), 'failed');
});
