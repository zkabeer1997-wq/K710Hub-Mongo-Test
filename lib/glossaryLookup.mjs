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

let index = null;

function buildIndex() {
  const map = new Map();
  for (const entry of GLOSSARY_TERMS) {
    const full = entry.term.trim().toLowerCase();
    const short = normalize(entry.term);
    if (!map.has(full)) map.set(full, entry);
    if (!map.has(short)) map.set(short, entry);
  }
  return map;
}

/**
 * Looks up a glossary entry for `term`, matching case-insensitively and
 * tolerant of either the short form ("KvK") or the stored parenthetical
 * long form ("KvK (Kingdom vs Kingdom)"). Returns the matching
 * { term, definition } entry, or null when nothing matches.
 */
export function lookupDefinition(term) {
  if (!term) return null;
  if (!index) index = buildIndex();
  const key = normalize(term);
  if (!key) return null;
  return index.get(key) || index.get(term.trim().toLowerCase()) || null;
}
