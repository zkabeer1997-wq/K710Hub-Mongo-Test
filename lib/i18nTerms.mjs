// Game-term protection for runtime UI translation.
//
// Machine translation (Chrome on-device Translator or the LibreTranslate
// fallback) must not rewrite K710's game vocabulary: players use the English
// names in-game, so "Governor Gear" or "KvK" has to stay recognisable in every
// language. Before a string is translated, each protected term is swapped for
// a numbered placeholder; afterwards the placeholder is swapped back. If the
// engine drops or mangles a placeholder the whole string falls back to the
// original English (safe: never a wrong or missing term).
//
// Admin-provided translations: ADMIN_TERM_TRANSLATIONS maps a language code
// (the same codes the translate API resolves: "es", "fr", "pb", "zh", ...) to
// { "English term": "translation" }. A term listed there for the target
// language is replaced by that translation instead of staying English. It is a
// code-level list today (edit this file, reviewed like any change); there is
// no admin UI for it yet.

/** English game terms that must never be machine-translated. Longest match wins. */
export const PROTECTED_TERMS = [
  'Kingdom 710', 'K710 Hub', 'K710', 'KvK', 'TTG', 'TG',
  'Flamedragon Tyrant', 'Swordland Showdown', 'Tri-Alliance Clash', 'Castle Battle',
  'Noble Advisor', 'Chief Minister', 'Governor Gear', 'Mystic Trial', 'Bear Hunt',
  'Prep Phase Backpack', 'Prep Phase', 'Power Profile', 'Release Timeline',
  'Hero Gear', 'Charms', 'Masters', 'Pets', 'Troop Training',
  'True Gold', 'Dragon’s Caravan', 'Wavebound',
];

/** { [languageCode]: { [English term]: translated term } } - filled in by admins/leadership. */
export const ADMIN_TERM_TRANSLATIONS = {};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTED = [...PROTECTED_TERMS].sort((a, b) => b.length - a.length);
// Terms may not sit inside a longer word ("TG" must not match inside "TGIF" or "mTG").
const TERM_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${SORTED.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');

/**
 * @returns {{ text: string, terms: string[] }} text with "[[0]]", "[[1]]"... in
 *   place of each protected term (terms[i] is the original for placeholder i)
 */
export function protectTerms(text, protect = true) {
  const source = String(text ?? '');
  if (!protect) return { text: source, terms: [] };
  const terms = [];
  const masked = source.replace(TERM_RE, (match) => {
    terms.push(match);
    return `[[${terms.length - 1}]]`;
  });
  return { text: masked, terms };
}

/**
 * Swap placeholders back. Returns null when any placeholder is missing from the
 * translation (the caller then keeps the English original).
 * @param {string} translated
 * @param {string[]} terms from protectTerms
 * @param {string} [languageCode] picks ADMIN_TERM_TRANSLATIONS[languageCode]
 */
export function restoreTerms(translated, terms, languageCode, overrides = ADMIN_TERM_TRANSLATIONS) {
  let out = String(translated ?? '');
  const custom = (languageCode && overrides[languageCode]) || {};
  for (let i = 0; i < terms.length; i += 1) {
    const re = new RegExp(`\\[\\s*\\[\\s*${i}\\s*\\]\\s*\\]`, 'g');
    if (!re.test(out)) return null;
    out = out.replace(re, () => custom[terms[i]] || terms[i]);
  }
  return out;
}

/**
 * Translate `items` with `translate(maskedItems) -> Promise<string[]>`, keeping
 * protected terms intact. Strings whose placeholders were damaged come back
 * as the original English.
 * @returns {Promise<string[]>} same length/order as items
 */
export async function translateWithProtectedTerms(items, translate, languageCode, overrides = ADMIN_TERM_TRANSLATIONS) {
  const masked = items.map((item) => protectTerms(item));
  const translated = await translate(masked.map((m) => m.text));
  return items.map((original, i) => {
    const restored = restoreTerms(translated[i], masked[i].terms, languageCode, overrides);
    return restored === null ? original : restored;
  });
}
