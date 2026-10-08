/**
 * Per-IP rate limiting for public API routes.
 *
 * Primary store: a shared MongoDB collection (`rate_limits`) so limits hold
 * across serverless instances. Fixed-window counters are bumped atomically with
 * findOneAndUpdate + $inc on a per-(key, window) document; a TTL index on
 * `expires_at` (see lib/mongoCollections.js) cleans old windows up.
 *
 * Failure policy when MongoDB is unreachable or errors:
 *  - default (fail CLOSED-ish, for auth/abuse-sensitive routes such as admin
 *    login, interest submit, status lookup): fall back to the per-instance
 *    in-memory limiter, so a limit is still enforced (just not globally).
 *  - `failOpen: true` (low-risk, cost-only routes such as translate-ui and OCR):
 *    allow the request instead of consuming the in-memory budget twice; a Mongo
 *    outage must not take these features down.
 *
 * `isRateLimited` (synchronous, in-memory only) is kept for callers that cannot
 * await; new code should use `checkRateLimit`.
 */

const buckets = new Map();
const MAX_TRACKED_KEYS = 5000;
export const RATE_LIMIT_COLLECTION = 'rate_limits';

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * In-memory sliding-window limiter (per warm instance).
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

export function resetInMemoryRateLimits() {
  buckets.clear();
}

let collectionProvider = null;

/** Test hook: supply `async () => collection` instead of lib/mongo.js. */
export function setRateLimitCollectionProvider(provider) {
  collectionProvider = provider;
}

async function getRateLimitCollection() {
  if (collectionProvider) return collectionProvider();
  if (process.env.QA_NO_DB === '1' || !(process.env.MONGODB_URI || process.env.MONGO_URI)) {
    throw new Error('rate limit store unavailable');
  }
  const { getCollection } = await import('./mongo.js');
  return getCollection(RATE_LIMIT_COLLECTION);
}

/**
 * Shared, async rate limit check.
 * @param {string} key
 * @param {{ windowMs: number, max: number, failOpen?: boolean }} options
 * @returns {Promise<boolean>} true when the caller is over the limit
 */
export async function checkRateLimit(key, { windowMs, max, failOpen = false }) {
  try {
    const coll = await getRateLimitCollection();
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const doc = await coll.findOneAndUpdate(
      { _id: `${key}:${windowStart}` },
      {
        $inc: { count: 1 },
        $setOnInsert: { key, expires_at: new Date(windowStart + windowMs + 60_000) },
      },
      { upsert: true, returnDocument: 'after' }
    );
    // Driver 6 returns the document directly; older shapes wrap it in `.value`.
    const row = doc && typeof doc === 'object' && 'value' in doc && !('count' in doc) ? doc.value : doc;
    const count = Number(row?.count);
    if (!Number.isFinite(count)) throw new Error('rate limit store returned no counter');
    return count > max;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test' && process.env.QA_NO_DB !== '1') {
      console.error('rate limit store failed; using fallback', error?.message || error);
    }
    if (failOpen) return false;
    return isRateLimited(key, { windowMs, max });
  }
}
