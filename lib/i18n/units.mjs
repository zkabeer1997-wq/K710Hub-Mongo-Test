// Pure helpers shared by the browser overlay, the /api/translate route, the pre-warm crawler and the
// tests. No imports, no DOM, no Node-only APIs: this file is also inlined into a headless browser by
// scripts/translate-warm.mjs, so it must stay self-contained.
//
// A "unit" is one piece of visible text that is translated as a whole: a block of text (a paragraph,
// a button, a list item) or, when the block holds markup we cannot keep, one text node. Inline markup
// inside a block is carried as numbered tags so the sentence stays whole:
//
//     "Join the <x1>Flamedragon Tyrant</x1> event today"
//
// Literal &, < and > inside the text are entity-encoded (&amp; &lt; &gt;), so a unit is always valid
// HTML-ish text and the only real tags in it are <xN>...</xN>.

export const RUNTIME_LIMITS = Object.freeze({
  maxStringsPerRequest: 60,
  maxCharsPerString: 2000,
  maxCharsPerRequest: 12000,
  // Client batching stays under the server limits.
  clientBatchStrings: 40,
  clientBatchChars: 8000,
});

const TAG_RE = /<\/?x\d+>/g;
const TAG_SPLIT_RE = /(<\/?x\d+>)/;
/** split() with this keeps the tags: odd indexes are tags, even indexes are text. */
export const TAG_SPLIT = TAG_SPLIT_RE;

export function escapeUnitText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeUnitText(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : whole; } catch { return whole; }
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** Collapse whitespace runs, trim, NFC. The cache key is built from this. */
export function normalizeUnit(text) {
  return String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Split leading and trailing whitespace off so it can be put back around the translation. */
export function splitEdges(raw) {
  const text = String(raw ?? '');
  const lead = text.match(/^\s*/)[0];
  const trail = text.length > lead.length ? text.match(/\s*$/)[0] : '';
  return { lead, core: text.slice(lead.length, text.length - trail.length), trail };
}

/** Tag sequence of a unit, e.g. "o1,c1,o2,c2". Used to check the API kept the markup intact. */
export function tagSignature(unit) {
  return (String(unit).match(TAG_RE) || []).map((tag) => `${tag[1] === '/' ? 'c' : 'o'}${tag.replace(/\D/g, '')}`).join(',');
}

/** Parse a unit into tokens: {text}, {open: n}, {close: n}. Text is entity-decoded. */
export function parseUnit(unit) {
  return String(unit).split(TAG_SPLIT_RE).filter((p) => p !== '').map((piece) => {
    const m = /^<(\/?)x(\d+)>$/.exec(piece);
    if (!m) return { text: decodeUnitText(piece) };
    return m[1] ? { close: Number(m[2]) } : { open: Number(m[2]) };
  });
}

/** Text without tags (decoded), for letter checks. */
export function plainOf(unit) {
  return decodeUnitText(String(unit).replace(TAG_RE, ''));
}

const SCRIPT_RE = {
  ko: /[가-힯ᄀ-ᇿ㄰-㆏]/,
  ar: /[؀-ۿݐ-ݿ]/,
  zh: /[一-鿿㐀-䶿]/,
  ja: /[぀-ヿ一-鿿]/,
  hi: /[ऀ-ॿ]/,
};

/** True when the text is already written in the target language's own script (nothing to translate). */
export function looksTranslated(plain, lang) {
  const re = SCRIPT_RE[lang];
  if (!re) return false;
  const letters = plain.match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  const own = letters.filter((c) => re.test(c)).length;
  return own / letters.length > 0.3;
}

const URL_OR_EMAIL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/\S+|www\.\S+|\S+@\S+\.\S+|[/#.][\w\-./?=&%#]*|[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?)$/i;
const CODE_LIKE_RE = /^[A-Za-z0-9_\-.:/#@+]+$/;

/**
 * Should this text go to the translator at all? Skips numbers, dates, times, ids, urls, codes and
 * strings without real words. `glossaryRe` (optional) removes protected game terms first, so a
 * label that is only "KvK" or "Kingshot" is left alone.
 */
export function isTranslatableText(text, { glossaryRe = null, lang = null } = {}) {
  const plain = plainOf(text).trim();
  if (plain.length < 2 || plain.length > RUNTIME_LIMITS.maxCharsPerString) return false;
  if (URL_OR_EMAIL_RE.test(plain)) return false;
  let rest = plain;
  if (glossaryRe) rest = rest.replace(glossaryRe, ' ');
  const letters = rest.match(/\p{L}/gu) || [];
  if (letters.length < 2) return false;
  // A single token made of letters+digits/symbols with no spaces (gift code, id, slug, version): leave alone.
  if (!/\s/.test(rest.trim()) && CODE_LIKE_RE.test(rest.trim()) && (/\d/.test(rest) || /^[A-Z0-9_\-.]+$/.test(rest.trim()) || /[_/]/.test(rest))) return false;
  // "12:30 UTC", "5 TG", "T10": digits plus nothing but short upper-case abbreviations.
  if (/\d/.test(rest)) {
    const words = rest.match(/\p{L}+/gu) || [];
    if (words.every((w) => w.length <= 4 && w === w.toUpperCase())) return false;
  }
  if (lang && looksTranslated(plain, lang)) return false;
  return true;
}

/** Fast 53-bit string hash (cyrb53) for the browser cache key. Not cryptographic. */
export function hashString(text, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Browser cache key for one unit in one language. */
export function clientKey(lang, unit) {
  return hashString(`${lang}\n${normalizeUnit(unit)}`);
}

/**
 * Put a translated core back between the original edge whitespace. If the English text ended with
 * sentence punctuation and the translation lost it (the API sometimes strips it), nothing is added:
 * punctuation is part of the core and travels with it.
 */
export function withEdges(edges, translatedCore) {
  return `${edges.lead}${translatedCore}${edges.trail}`;
}

/**
 * Apply a translated unit to the pieces of a block. `pieces` describes the original block: an array of
 * {kind: 'text'} (a direct text node) and {kind: 'inline', id} entries, in DOM order. Returns
 * {texts: string[] for each 'text' piece, inner: {id: string}} or null when the translation does not
 * have the same markup as the English (the caller then falls back to per-node units).
 */
export function distributeUnit(translatedUnit, sourceUnit) {
  if (tagSignature(translatedUnit) !== tagSignature(sourceUnit)) return null;
  const tokens = parseUnit(translatedUnit);
  const texts = [''];
  const inner = {};
  let current = null;
  for (const token of tokens) {
    if ('open' in token) { current = token.open; inner[current] = ''; } else if ('close' in token) { current = null; texts.push(''); } else if (current != null) inner[current] += token.text;
    else texts[texts.length - 1] += token.text;
  }
  return { texts, inner };
}
