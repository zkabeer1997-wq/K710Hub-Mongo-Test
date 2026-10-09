// Server side of the runtime translation layer: overrides -> Mongo cache -> machine translation.
// Used by app/api/translate/route.js and scripts/translate-warm.mjs. Everything that touches the
// outside world is injected (`getCollection`, `fetchImpl`), so the tests run it against fakeMongo
// and a mocked fetch.
//
// Order of precedence for every string: human override (translation_overrides) > cache > machine.
// Mock output (GOOGLE_TRANSLATE_ENDPOINT pointing anywhere but Google) lives in its own collections,
// so it can never be served to real visitors.
import { createHash } from 'node:crypto';
import {
  buildMatcher, callTranslate, engineFor, glossaryTerms, redactSecrets, resolveEndpoint,
} from './catalogTools.mjs';
import { NON_ENGLISH } from './languages.mjs';
import {
  RUNTIME_LIMITS, decodeUnitText, escapeUnitText, normalizeUnit, tagSignature, TAG_SPLIT,
} from './units.mjs';

export const CACHE_COLLECTION = 'translation_cache';
export const MOCK_CACHE_COLLECTION = 'translation_cache_mock';
export const OVERRIDES_COLLECTION = 'translation_overrides';
export const BUDGET_COLLECTION = 'translation_budget';
export const DEFAULT_DAILY_BUDGET = 200000;

/** sha256(lang + normalized text), hex. The primary key of the cache and override collections. */
export function cacheKey(lang, text) {
  return createHash('sha256').update(`${lang}\n${normalizeUnit(text)}`).digest('hex');
}

export function cacheCollectionFor(engine) {
  return engine === 'google' ? CACHE_COLLECTION : MOCK_CACHE_COLLECTION;
}

export function dailyBudget(env = process.env) {
  const n = Number(env?.TRANSLATE_DAILY_CHAR_BUDGET);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET;
}

export function isSupportedLanguage(lang) {
  return NON_ENGLISH.includes(lang);
}

/**
 * Mask protected terms and {placeholders} inside a unit. Unit text is entity-encoded and may hold
 * <xN> tags; only the text between tags is searched, and every protected span is wrapped in
 * <span class="notranslate" translate="no"> so the API leaves it alone.
 */
export function maskUnit(unit, matcher) {
  return String(unit).split(TAG_SPLIT).map((piece, i) => {
    if (i % 2 === 1) return piece; // an <xN> tag
    const plain = decodeUnitText(piece);
    let out = '';
    let last = 0;
    for (const match of plain.matchAll(matcher)) {
      out += escapeUnitText(plain.slice(last, match.index));
      out += `<span class="notranslate" translate="no">${escapeUnitText(match[0])}</span>`;
      last = match.index + match[0].length;
    }
    return out + escapeUnitText(plain.slice(last));
  }).join('');
}

const placeholdersOf = (text) => [...String(text).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort().join(',');

/**
 * Undo maskUnit on the API answer. Returns null when it cannot be trusted: empty, the <xN> markup
 * differs from the English unit, or a {placeholder} changed.
 */
export function restoreUnit(translated, original) {
  if (typeof translated !== 'string') return null;
  const noSpans = translated.replace(/<\/?span\b[^>]*>/gi, '');
  const pieces = noSpans.split(TAG_SPLIT).map((piece, i) => {
    if (i % 2 === 1) return piece.replace(/\s+/g, '');
    // Remove stray tags the engine invented, decode its entities, then re-encode only & < >.
    return escapeUnitText(decodeUnitText(piece.replace(/<[^>]+>/g, '')));
  });
  const result = pieces.join('').replace(/\s+/g, ' ').trim();
  if (!result || !decodeUnitText(result.replace(/<\/?x\d+>/g, '')).trim()) return null;
  if (tagSignature(result) !== tagSignature(original)) return null;
  if (placeholdersOf(decodeUnitText(result)) !== placeholdersOf(decodeUnitText(original))) return null;
  return result;
}

/** Validate the request body of /api/translate. Returns {lang, strings} or {error}. */
export function validateRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON body with "lang" and "strings".' };
  if (!isSupportedLanguage(body.lang)) return { error: `"lang" must be one of: ${NON_ENGLISH.join(', ')}.` };
  const { strings } = body;
  if (!Array.isArray(strings) || strings.length === 0) return { error: '"strings" must be a non-empty array.' };
  if (strings.length > RUNTIME_LIMITS.maxStringsPerRequest) return { error: `At most ${RUNTIME_LIMITS.maxStringsPerRequest} strings per request.` };
  let total = 0;
  for (const s of strings) {
    if (typeof s !== 'string' || !s.trim()) return { error: 'Every string must be non-empty text.' };
    if (s.length > RUNTIME_LIMITS.maxCharsPerString) return { error: `A string is longer than ${RUNTIME_LIMITS.maxCharsPerString} characters.` };
    total += s.length;
  }
  if (total > RUNTIME_LIMITS.maxCharsPerRequest) return { error: `At most ${RUNTIME_LIMITS.maxCharsPerRequest} characters per request.` };
  return { lang: body.lang, strings };
}

const dayStamp = (now) => new Date(now).toISOString().slice(0, 10);

/** Characters spent today against the budget (0 when the counter cannot be read). */
export async function budgetUsed({ getCollection, engine, now = Date.now() }) {
  try {
    const coll = await getCollection(BUDGET_COLLECTION);
    const doc = await coll.findOne({ _id: `${dayStamp(now)}:${engine}` });
    return Number(doc?.chars) || 0;
  } catch {
    return 0;
  }
}

async function chargeBudget({ getCollection, engine, now, chars, limit }) {
  const coll = await getCollection(BUDGET_COLLECTION);
  const id = `${dayStamp(now)}:${engine}`;
  const doc = await coll.findOne({ _id: id });
  const used = Number(doc?.chars) || 0;
  if (used + chars > limit) return false;
  await coll.updateOne({ _id: id }, { $inc: { chars }, $set: { engine, expires_at: new Date(now + 40 * 864e5) } }, { upsert: true });
  return true;
}

/**
 * Translate units into one language.
 *
 * @returns {Promise<{translations: (string|null)[], status: 'ok'|'partial'|'unavailable'|'budget', engine: string, stats: object}>}
 *   `translations[i]` is null when no translation is available (the page keeps the English).
 */
export async function translateUnits({
  lang, strings, glossary, getCollection, fetchImpl = fetch, apiKey = '', endpoint = resolveEndpoint(),
  enforceBudget = true, budget = dailyBudget(), now = Date.now(), onlyCached = false,
}) {
  const engine = engineFor(endpoint);
  const stats = { override: 0, cache: 0, api: 0, chars: 0, failed: 0, budgetDenied: 0 };
  const out = new Array(strings.length).fill(null);
  const keys = strings.map((s) => cacheKey(lang, s));
  const unique = [...new Set(keys)];

  const found = new Map(); // key -> text
  const readMany = async (collName, kind) => {
    try {
      const coll = await getCollection(collName);
      const rows = await coll.find({ _id: { $in: unique } }).toArray();
      for (const row of rows) {
        if (typeof row.text === 'string' && row.text && (kind === 'override' || !found.has(row._id))) {
          // Never trust a stored value whose markup no longer matches the English it was stored for.
          found.set(row._id, { text: row.text, kind });
        }
      }
    } catch { /* an unreadable store only means more API calls, never an error page */ }
  };
  await readMany(cacheCollectionFor(engine), 'cache');
  await readMany(OVERRIDES_COLLECTION, 'override'); // overrides replace cache entries

  const misses = []; // unique strings still needing the API
  const seen = new Set();
  strings.forEach((s, i) => {
    const hit = found.get(keys[i]);
    if (hit && tagSignature(hit.text) === tagSignature(s)) {
      out[i] = hit.text;
      stats[hit.kind] += 1;
    } else if (!seen.has(keys[i])) {
      seen.add(keys[i]);
      misses.push({ index: i, key: keys[i], unit: s });
    }
  });

  let status = 'ok';
  if (misses.length && !onlyCached) {
    const matcher = buildMatcher(glossaryTerms(glossary));
    const masked = misses.map((m) => ({ ...m, masked: maskUnit(m.unit, matcher) }));
    const chars = masked.reduce((sum, m) => sum + m.masked.length, 0);
    if (!apiKey) {
      status = 'unavailable';
    } else {
      let allowed = true;
      if (enforceBudget) {
        try { allowed = await chargeBudget({ getCollection, engine, now, chars, limit: budget }); } catch { allowed = true; } // fails open: counter trouble must not block translation
      }
      if (!allowed) {
        status = 'budget';
        stats.budgetDenied = misses.length;
      } else {
        try {
          const answers = await callTranslate({ texts: masked.map((m) => m.masked), target: lang === 'zh' ? 'zh-CN' : lang, apiKey, endpoint, fetchImpl, retries: 1 });
          const rows = [];
          masked.forEach((m, j) => {
            const restored = restoreUnit(answers[j], m.unit);
            if (!restored) { stats.failed += 1; return; }
            rows.push({ key: m.key, source: normalizeUnit(m.unit), text: restored });
            stats.api += 1;
            stats.chars += m.masked.length;
            found.set(m.key, { text: restored, kind: 'cache' });
          });
          if (rows.length) {
            try {
              const coll = await getCollection(cacheCollectionFor(engine));
              await coll.bulkWrite(rows.map((r) => ({
                updateOne: { filter: { _id: r.key }, update: { $set: { lang, source: r.source, text: r.text, engine, created_at: new Date(now) } }, upsert: true },
              })), { ordered: false });
            } catch { /* cache write trouble: the answer is still returned */ }
          }
          status = stats.failed ? 'partial' : 'ok';
        } catch (error) {
          status = 'unavailable';
          stats.error = redactSecrets(error?.message || 'translation failed', apiKey).slice(0, 300);
          stats.httpStatus = error?.status || 0;
        }
      }
    }
    strings.forEach((s, i) => {
      if (out[i] == null) {
        const hit = found.get(keys[i]);
        if (hit && tagSignature(hit.text) === tagSignature(s)) out[i] = hit.text;
      }
    });
  }
  return { translations: out, status: out.some((t) => t == null) && status === 'ok' ? 'partial' : status, engine, stats };
}
