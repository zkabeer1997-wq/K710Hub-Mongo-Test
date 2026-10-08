// Case-insensitive lookup of a glossary definition, tolerant of the
// parenthetical long forms used in lib/glossary.js (e.g. the stored term
// "KvK (Kingdom vs Kingdom)" should match a caller passing just "KvK").
// Kept dependency-free (no React) so it can be imported from both the
// client Term component and plain node --test files.
import { GLOSSARY_TERMS } from './glossary.js';

// Strips a trailing "(...)" parenthetical and trims whitespace, so
// "KvK (Kingdom vs Kingdom)" normalizes to "kvk" the same as a bare "KvK".
function normalize(value) {
  return String(value || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

let defaultIndex = null;
const overrideIndexes = new WeakMap();

function buildIndex(terms) {
  const map = new Map();
  for (const entry of terms) {
    const full = entry.term.trim().toLowerCase();
    const short = normalize(entry.term);
    if (!map.has(full)) map.set(full, entry);
    if (!map.has(short)) map.set(short, entry);
  }
  return map;
}

function indexFor(terms) {
  if (!terms) return (defaultIndex ||= buildIndex(GLOSSARY_TERMS));
  let idx = overrideIndexes.get(terms);
  if (!idx) { idx = buildIndex(terms); overrideIndexes.set(terms, idx); }
  return idx;
}

/**
 * Looks up a glossary entry for `term`, matching case-insensitively and
 * tolerant of either the short form ("KvK") or the stored parenthetical
 * long form ("KvK (Kingdom vs Kingdom)"). Returns the matching
 * { term, definition } entry, or null when nothing matches.
 * `terms` (optional) replaces the built-in list, used when an admin has
 * edited the glossary (provided to client components by GlossaryProvider).
 */
export function lookupDefinition(term, terms = null) {
  if (!term) return null;
  const index = indexFor(terms);
  const key = normalize(term);
  if (!key) return null;
  return index.get(key) || index.get(term.trim().toLowerCase()) || null;
}
