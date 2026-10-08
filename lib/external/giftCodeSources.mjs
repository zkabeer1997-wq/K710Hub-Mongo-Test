// Gift code sources: kingshot.net (primary) and kingshotmastery.com (secondary).
// Everything parsed here is UNTRUSTED third-party content: codes are validated
// strictly, text is stripped of markup, lists are capped. Pure functions only
// (the Mongo-aware orchestration lives in lib/giftCodeDiscovery.mjs).
import { cleanText, ExternalError, isPlainObject } from './sanitize.mjs';
import { fetchExternal } from './http.mjs';
import { GIFT_HOST_MASTERY, GIFT_HOST_NET } from './sources.mjs';

export const GIFT_MAX_CODES = 100;
export const GIFT_MAX_BYTES = 2 * 1024 * 1024;
export const GIFT_BLOCKED_PAUSE_MS = 24 * 60 * 60 * 1000;

/** Priority order: index 0 is primary. */
export const GIFT_SOURCES = [
  {
    id: 'kingshot.net',
    label: 'kingshot.net',
    host: GIFT_HOST_NET,
    url: `https://${GIFT_HOST_NET}/gift-codes`,
    enabledByDefault: true,
    note: 'robots.txt allows /gift-codes; no terms page forbids reading it. Primary source.',
  },
  {
    id: 'kingshotmastery.com',
    label: 'kingshotmastery.com',
    host: GIFT_HOST_MASTERY,
    url: `https://${GIFT_HOST_MASTERY}/gift-codes`,
    // Its Terms of Service forbid "robots, or similar data gathering and extraction methods",
    // even though robots.txt allows the page. Off unless the owner opts in (GIFT_ENABLE_KINGSHOTMASTERY=1).
    enabledByDefault: false,
    note: 'Its Terms of Service prohibit automated data gathering, so it is only read automatically if the owner opts in.',
  },
];

export function giftSourceById(id) {
  return GIFT_SOURCES.find((s) => s.id === id) || null;
}

export function enabledGiftSources(env = process.env) {
  return GIFT_SOURCES.filter((s) => (s.id === 'kingshotmastery.com' ? env.GIFT_ENABLE_KINGSHOTMASTERY === '1' : s.enabledByDefault));
}

export function snapshotKeyFor(sourceId) {
  return `giftcodes:${sourceId}`;
}

// ---------- normalization ----------

const CODE_RE = /^[A-Za-z0-9]{4,32}$/;

/** Strip markup and validate. Returns the code in its ORIGINAL case (redemption is case sensitive) or null. */
export function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
  return CODE_RE.test(text) ? text : null;
}

/** Case-insensitive identity used for de-duplication. */
export function codeKey(code) {
  return String(code).toUpperCase();
}

function parseDate(value, endOfDay = false) {
  if (typeof value !== 'string') return null;
  const v = value.replace(/^\$D/, '');
  if (!v || v === '$undefined') return null;
  // Date-only expiry ("2026-12-31") means the end of that day (UTC).
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T${endOfDay ? '23:59:59' : '00:00:00'}Z`) : Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  return year >= 2024 && year <= 2100 ? new Date(ms).toISOString() : null;
}

const NO_REWARD = /^(not specified( yet)?|rewards? vary.*|n\/a|none|unknown|-+)$/i;
function cleanReward(value) {
  const text = cleanText(typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ') : '', 200);
  return !text || NO_REWARD.test(text) ? null : text;
}

/**
 * Turn loosely shaped entries into clean ones: validated code, plain-text rewards,
 * ISO dates; drops invalid codes, expired entries and duplicates; caps the list.
 * entry: { code, active?, rewards?, added_at?, expires_at? }
 */
export function normalizeEntries(entries, { source, now = Date.now(), max = GIFT_MAX_CODES } = {}) {
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!isPlainObject(e)) { dropped += 1; continue; }
    const code = normalizeCode(e.code);
    if (!code || e.active === false) { dropped += 1; continue; }
    const expires = parseDate(e.expires_at, true);
    if (expires && Date.parse(expires) <= now) { dropped += 1; continue; }
    const key = codeKey(code);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code,
      rewards: cleanReward(e.rewards),
      added_at: parseDate(e.added_at),
      expires_at: expires,
      source,
    });
    if (out.length >= max) break;
  }
  return { codes: out, dropped };
}

// ---------- Next.js RSC payload + JSON-LD extraction ----------

/** Concatenated, decoded text of every self.__next_f.push([1,"..."]) chunk. */
export function extractFlightText(html) {
  if (typeof html !== 'string') return '';
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse(`"${m[1]}"`);
    } catch { /* skip a malformed chunk */ }
  }
  return out;
}

/** Find `marker` (ending in `[`) and return the balanced JSON array that follows, parsed. */
export function extractJsonArray(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const open = start + marker.length - 1;
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const arr = JSON.parse(text.slice(open, i + 1));
          return Array.isArray(arr) ? arr : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** All JSON-LD ItemList nodes in the page (flattening arrays and @graph). */
export function extractItemLists(html) {
  const lists = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (isPlainObject(node)) {
        if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) lists.push(node);
        if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      }
    }
  }
  return lists;
}

function itemListEntries(html) {
  const list = extractItemLists(html).find((l) => /gift/i.test(String(l.name || '')) || l.itemListElement.length);
  if (!list) return null;
  return list.itemListElement.map((el) => {
    const item = isPlainObject(el?.item) ? el.item : el;
    const desc = typeof item?.description === 'string' ? item.description : '';
    const rewards = /Rewards:\s*(.+?)\.?$/i.exec(desc)?.[1] || null;
    return { code: item?.name, rewards };
  });
}

function finish(entries, source, via, opts) {
  const { codes, dropped } = normalizeEntries(entries, { source, ...opts });
  return { source, via, codes, listed: Array.isArray(entries) ? entries.length : 0, dropped };
}

// ---------- the two parsers ----------

/** kingshot.net/gift-codes: RSC `initialData.giftCodes` (id, code, reward, isActive, expiresAt, ...) with a JSON-LD ItemList fallback. */
export function parseKingshotNet(html, opts = {}) {
  const flight = extractFlightText(html);
  const rows = flight ? extractJsonArray(flight, '"giftCodes":[') : null;
  if (rows && rows.length && rows.every((r) => isPlainObject(r) && 'code' in r)) {
    return finish(
      rows.map((r) => ({
        code: r.code,
        active: r.isActive !== false,
        rewards: r.reward,
        added_at: r.startTime || r.createdAt,
        expires_at: r.expiresAt,
      })),
      'kingshot.net', 'payload', opts,
    );
  }
  const items = itemListEntries(html);
  if (items && items.length) return finish(items, 'kingshot.net', 'jsonld', opts);
  throw new ExternalError('shape', 'kingshot.net page has no recognisable gift code list');
}

/** kingshotmastery.com/gift-codes: RSC `initialData.codes` (code, date, rewards, status, expiresAt) with a JSON-LD fallback. */
export function parseKingshotMastery(html, opts = {}) {
  const flight = extractFlightText(html);
  const rows = flight ? extractJsonArray(flight, '"codes":[') : null;
  if (rows && rows.length && rows.every((r) => isPlainObject(r) && 'code' in r)) {
    return finish(
      rows.map((r) => ({
        code: r.code,
        active: String(r.status || 'Active').toLowerCase() === 'active',
        rewards: r.rewards,
        added_at: r.date,
        expires_at: r.expiresAt,
      })),
      'kingshotmastery.com', 'payload', opts,
    );
  }
  const items = itemListEntries(html);
  if (items && items.length) return finish(items, 'kingshotmastery.com', 'jsonld', opts);
  throw new ExternalError('shape', 'kingshotmastery.com page has no recognisable gift code list');
}

export const GIFT_PARSERS = {
  'kingshot.net': parseKingshotNet,
  'kingshotmastery.com': parseKingshotMastery,
};

// ---------- merge ----------

/**
 * Union by normalized code. `results` is ordered by priority (primary first):
 *   [{ source, codes: [{ code, rewards, added_at, expires_at }] }]
 * The primary's spelling wins, the entry carrying expiry info wins for dates,
 * and every source that lists the code is recorded in `sources`.
 */
export function mergeSourceResults(results, { max = GIFT_MAX_CODES } = {}) {
  const byKey = new Map();
  for (const r of results || []) {
    for (const c of r?.codes || []) {
      const code = normalizeCode(c.code);
      if (!code) continue;
      const key = codeKey(code);
      const cur = byKey.get(key);
      if (!cur) {
        byKey.set(key, { code, rewards: c.rewards || null, added_at: c.added_at || null, expires_at: c.expires_at || null, sources: [r.source] });
        continue;
      }
      if (!cur.sources.includes(r.source)) cur.sources.push(r.source);
      if (!cur.expires_at && c.expires_at) cur.expires_at = c.expires_at;
      if (!cur.rewards && c.rewards) cur.rewards = c.rewards;
      if (c.added_at && (!cur.added_at || c.added_at < cur.added_at)) cur.added_at = c.added_at;
    }
  }
  return [...byKey.values()].slice(0, max);
}

// ---------- fetch ----------

/** Short tag stored with a failure so the admin page can say what happened. */
export function classifyFailure(error) {
  const code = error?.code;
  const msg = String(error?.message || '');
  if (code === 'robots') return 'robots';
  if (code === 'shape') return 'shape';
  if (code === 'http' && /refused automated access/i.test(msg)) return 'blocked';
  return 'failed';
}

/** Fetch + parse one source. Throws ExternalError whose message is prefixed with the failure tag. */
export async function fetchGiftSource(source, { fetchImpl, now = Date.now() } = {}) {
  try {
    const { text } = await fetchExternal(source.url, { fetchImpl, now, maxBytes: GIFT_MAX_BYTES });
    const parsed = GIFT_PARSERS[source.id](text, { now });
    return {
      source: source.id,
      via: parsed.via,
      codes: parsed.codes,
      listed: parsed.listed,
      checked_at: new Date(now).toISOString(),
    };
  } catch (error) {
    const tag = classifyFailure(error);
    const wrapped = new ExternalError(error?.code || 'network', `${tag}: ${String(error?.message || error).slice(0, 150)}`);
    wrapped.tag = tag;
    throw wrapped;
  }
}
