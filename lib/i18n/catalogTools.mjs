// Pure logic behind scripts/translate-catalog.mjs (masking, restoring, diffing, batching, the
// Google Cloud Translation v2 call). No file or environment access here, so it is unit-tested
// with a mocked fetch (tests/i18nCatalogTools.test.mjs).
import { createHash } from 'node:crypto';

export const API_URL = 'https://translation.googleapis.com/language/translate/v2';

/** The v2 endpoint. GOOGLE_TRANSLATE_ENDPOINT points it at the local mock (scripts/dev/mock-translate-server.mjs). */
export function resolveEndpoint(env = process.env) {
  const custom = String(env?.GOOGLE_TRANSLATE_ENDPOINT || '').trim();
  return custom || API_URL;
}

/** 'google' for the real API, 'mock' for anything else. Mock output is never stored where real output is read. */
export function engineFor(endpoint) {
  try {
    return new URL(endpoint).hostname === 'translation.googleapis.com' ? 'google' : 'mock';
  } catch {
    return 'mock';
  }
}

/** Remove anything that looks like an API key from a message before it is shown or logged. */
export function redactSecrets(text, apiKey = '') {
  let out = String(text ?? '');
  if (apiKey && apiKey.length >= 8) out = out.split(apiKey).join('[redacted]');
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]').replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]');
}

/** Google's JSON error body -> "message (REASON)", with the key removed. Never throws. */
export async function describeApiError(response, apiKey = '') {
  try {
    const body = await response.json();
    const err = body?.error || {};
    const reason = err.details?.find?.((d) => d?.reason)?.reason || err.errors?.[0]?.reason || err.status || '';
    const message = String(err.message || '').slice(0, 300);
    return redactSecrets([message, reason && `(${reason})`].filter(Boolean).join(' '), apiKey);
  } catch {
    return '';
  }
}
// Google v2 allows 128 strings and about 30k characters per request; stay well under both.
export const MAX_QUERIES = 100;
export const MAX_CHARS = 20000;

export function hashText(text) {
  return createHash('sha1').update(String(text)).digest('hex').slice(0, 12);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** All terms of i18n/glossary.json (every array value), longest first. */
export function glossaryTerms(glossary) {
  const terms = Object.entries(glossary || {}).filter(([k, v]) => !k.startsWith('_') && Array.isArray(v)).flatMap(([, v]) => v);
  return [...new Set(terms.filter((t) => typeof t === 'string' && t.trim()))].sort((a, b) => b.length - a.length);
}

export function buildMatcher(terms) {
  const parts = terms.map(escapeRe);
  // Whole words only ("TG" must not match inside "TGIF"); {placeholders} always match.
  const body = parts.length ? `(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])|` : '';
  return new RegExp(`${body}\\{[a-zA-Z0-9_]+\\}`, 'gu');
}

/** Placeholder names found in a string, e.g. ['name', 'count']. */
export function placeholdersOf(text) {
  return [...String(text).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

/**
 * Mask protected terms and {placeholders} so the API leaves them alone: the text is sent as HTML
 * and every protected span is wrapped in <span class="notranslate" translate="no">.
 */
export function maskText(text, matcher) {
  const source = String(text);
  let out = '';
  let last = 0;
  for (const match of source.matchAll(matcher)) {
    out += escapeHtml(source.slice(last, match.index));
    out += `<span class="notranslate" translate="no">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + escapeHtml(source.slice(last));
}

/**
 * Undo maskText on the API's answer. Returns null when the result cannot be trusted: empty, or the
 * {placeholders} differ from the English source (a mangled placeholder must never ship).
 */
export function restoreText(translated, original) {
  if (typeof translated !== 'string') return null;
  const plain = decodeEntities(translated.replace(/<\/?span\b[^>]*>/gi, '').replace(/<[^>]+>/g, '')).trim();
  if (!plain) return null;
  const want = placeholdersOf(original);
  const got = placeholdersOf(plain);
  if (want.length !== got.length || want.some((p, i) => p !== got[i])) return null;
  return plain;
}

/**
 * What needs translating for one language.
 * @param {Record<string,{text:string}|string>} source English entries
 * @param {Record<string,string>} existing current locale strings
 * @param {Record<string,string>} manifest key -> hash of the English text that was translated
 * @returns {{todo: string[], stale: string[], removed: string[], keep: string[]}}
 */
export function diffCatalog(source, existing = {}, manifest = {}) {
  const todo = [];
  const stale = [];
  const keep = [];
  for (const [key, entry] of Object.entries(source)) {
    if (key.startsWith('_')) continue;
    const text = typeof entry === 'string' ? entry : entry.text;
    const hash = hashText(text);
    if (!existing[key]) todo.push(key);
    else if (manifest[key] !== hash) { todo.push(key); stale.push(key); } else keep.push(key);
  }
  const removed = Object.keys(existing).filter((k) => !Object.hasOwn(source, k));
  return { todo, stale, removed, keep };
}

/** Group masked strings into requests under both limits. Order is preserved. */
export function makeBatches(items, { maxQueries = MAX_QUERIES, maxChars = MAX_CHARS } = {}) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const item of items) {
    const size = item.text.length;
    if (current.length && (current.length >= maxQueries || chars + size > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** One API call. The key goes in a header, never in the URL, so it cannot end up in logs. */
export async function callTranslate({ texts, target, apiKey, endpoint = resolveEndpoint(), fetchImpl = fetch, retries = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let lastStatus = 0;
  let lastDetail = '';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify({ q: texts, source: 'en', target, format: 'html' }),
    });
    lastStatus = response.status;
    if (!response.ok) lastDetail = await describeApiError(response, apiKey);
    if (response.ok) {
      const data = await response.json();
      const list = data?.data?.translations;
      if (!Array.isArray(list) || list.length !== texts.length) throw new Error('Unexpected response shape from the translation API');
      return list.map((row) => row.translatedText);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    break;
  }
  // Status plus Google's own reason (key removed): never echo the request, which carries the key.
  const error = new Error(`Translation API request failed (HTTP ${lastStatus})${lastDetail ? `: ${lastDetail}` : ''}`);
  error.status = lastStatus;
  error.detail = lastDetail;
  throw error;
}

/**
 * Translate the given keys. Returns { strings: {key: text}, failed: [key] }.
 * A string whose placeholders came back damaged is reported in `failed` and left out (English shows).
 */
export async function translateKeys({ keys, source, target, glossary, apiKey, endpoint, fetchImpl, sleep, onBatch }) {
  const matcher = buildMatcher(glossaryTerms(glossary));
  const items = keys.map((key) => {
    const text = typeof source[key] === 'string' ? source[key] : source[key].text;
    return { key, text: maskText(text, matcher), original: text };
  });
  const strings = {};
  const failed = [];
  const batches = makeBatches(items);
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const out = await callTranslate({ texts: batch.map((b) => b.text), target, apiKey, endpoint, fetchImpl, sleep });
    batch.forEach((item, j) => {
      const restored = restoreText(out[j], item.original);
      if (restored) strings[item.key] = restored; else failed.push(item.key);
    });
    onBatch?.(i + 1, batches.length);
  }
  return { strings, failed };
}

/** Characters that would be billed for these keys (masked HTML length). */
export function estimateChars(keys, source, glossary) {
  const matcher = buildMatcher(glossaryTerms(glossary));
  return keys.reduce((sum, key) => sum + maskText(typeof source[key] === 'string' ? source[key] : source[key].text, matcher).length, 0);
}

/** Per-language review CSV: key, note, English, translation. */
export function toCsv(rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

/** Minimal RFC 4180 parser for the review CSV (quoted cells, doubled quotes, newlines inside cells). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
