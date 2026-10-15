// Pure helpers for the saved alliance order (no Next/Mongo imports; unit tested).

export const ORDER_STEP = 10;

/**
 * Checks a submitted ordered list of tags against the tags that exist. It must be the exact set:
 * no duplicates, nothing unknown, nothing missing. Returns { tags } (upper case) or { error }.
 */
export function validateOrderedTags(input, existingTags = []) {
  if (!Array.isArray(input)) return { error: 'Send the full list of alliance tags in order.' };
  const tags = input.map((t) => String(t ?? '').trim().toUpperCase());
  if (tags.some((t) => !t)) return { error: 'Every entry must be an alliance tag.' };
  const seen = new Set();
  for (const t of tags) {
    if (seen.has(t)) return { error: `${t} appears more than once.` };
    seen.add(t);
  }
  const existing = new Set((existingTags || []).map((t) => String(t).toUpperCase()));
  const unknown = tags.filter((t) => !existing.has(t));
  if (unknown.length) return { error: `Unknown alliance: ${unknown.join(', ')}.` };
  const missing = [...existing].filter((t) => !seen.has(t));
  if (missing.length) return { error: `Missing alliance: ${missing.join(', ')}. The list must include every alliance.` };
  return { tags };
}

/** sort_order values for an ordered list: 10, 20, 30 ... */
export function sortOrderFor(tags = []) {
  return tags.map((tag, index) => ({ tag, sort_order: (index + 1) * ORDER_STEP }));
}

/** sort_order for an alliance created now: after every existing one. */
export function nextSortOrder(rows = []) {
  const max = (rows || []).reduce((m, r) => {
    const n = r?.sort_order === null || r?.sort_order === '' ? NaN : Number(r?.sort_order);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return (Math.floor(max / ORDER_STEP) + 1) * ORDER_STEP;
}

/** Date or string to an ISO string (or '') so the value can cross to client components. */
export function isoOrEmpty(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Drops the order bookkeeping from public rows once they are ordered. */
export function stripOrderFields(rows = []) {
  return rows.map(({ sort_order: _s, order_updated_at: _o, ...rest }) => rest);
}
