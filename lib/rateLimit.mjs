/**
 * Simple in-memory per-IP rate limiter for public API routes. Same pattern
 * already used ad hoc in app/api/interest/route.js, extracted for reuse.
 *
 * Caveat: state lives in the serverless function's memory, not a shared
 * store, so limits are per warm instance rather than truly global. That's
 * an accepted tradeoff for these routes (no Redis/KV configured on this
 * stack) - it still stops a single abusive client hammering one instance,
 * which is the actual risk being mitigated (unbounded cost passthrough to
 * an external OCR/translation service), just not a distributed guarantee.
 */

const buckets = new Map();
const MAX_TRACKED_KEYS = 5000;

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * @param {string} key usually an IP address, optionally namespaced per route
 * @param {{ windowMs: number, max: number }} options
 * @returns {boolean} true when the caller has exceeded `max` hits in `windowMs`
 */
export function isRateLimited(key, { windowMs, max }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_TRACKED_KEYS) {
    const oldestKey = buckets.keys().next().value;
    buckets.delete(oldestKey);
  }
  return hits.length > max;
}
