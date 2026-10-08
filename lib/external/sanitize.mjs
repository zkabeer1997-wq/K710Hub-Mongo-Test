// Everything fetched from a third-party site is UNTRUSTED. These helpers coerce
// it into small, inert values (plain text, bounded numbers, ISO dates) before it
// is stored or rendered. React escapes text on render; we additionally strip
// markup/control characters and cap lengths so nothing odd is ever persisted.

export function cleanText(value, max = 160) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function toNum(value, { min = -1e9, max = 1e9 } = {}) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function toInt(value, bounds) {
  const n = toNum(value, bounds);
  return n === null ? null : Math.trunc(n);
}

/** Strict YYYY-MM-DD (a real calendar date) or null. */
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  const year = Number(value.slice(0, 4));
  return year >= 2024 && year <= 2100 ? value : null;
}

export function toDate(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' || typeof value === 'number' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Only https URLs on an explicit host allow-list; anything else becomes ''. */
export function safeUrl(value, hosts) {
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' || !hosts.includes(u.hostname)) return '';
    return u.href;
  } catch {
    return '';
  }
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export class ExternalError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ExternalError';
    this.code = code; // robots | host | http | timeout | size | shape | network
  }
}
