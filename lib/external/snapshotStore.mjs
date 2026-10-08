import { createHash } from 'node:crypto';
import { COLLECTIONS } from '../mongoCollections.js';
import { FRESH_MS, MIN_ATTEMPT_MS, STALE_MS } from './sources.mjs';
import { toDate } from './sanitize.mjs';

const COLL = COLLECTIONS.EXTERNAL_SNAPSHOTS;

export function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

/**
 * Durable last-good snapshots in Mongo (`external_snapshots`):
 *   { key, fetched_at, source_url, payload, hash, last_attempt_at, last_error }
 * The document _id IS the key, so uniqueness needs no extra index.
 * `last_attempt_at` doubles as a cross-instance lock/TTL: claimAttempt() only
 * succeeds for one caller per MIN_ATTEMPT_MS window, so many serverless
 * instances never stampede a third-party site.
 */
export function createSnapshotStore(getCollection) {
  const coll = () => getCollection(COLL);
  return {
    async read(key) {
      const doc = await (await coll()).findOne({ _id: key });
      if (!doc) return null;
      return {
        key,
        payload: doc.payload ?? null,
        fetchedAt: toDate(doc.fetched_at),
        lastAttemptAt: toDate(doc.last_attempt_at),
        sourceUrl: doc.source_url || '',
        hash: doc.hash || '',
        lastError: doc.last_error || null,
      };
    },
    async write(key, { sourceUrl, payload, now = new Date() }) {
      await (await coll()).updateOne(
        { _id: key },
        { $set: { key, fetched_at: now, source_url: sourceUrl, payload, hash: hashPayload(payload), last_error: null } },
        { upsert: true }
      );
    },
    async recordFailure(key, message, now = new Date()) {
      try {
        await (await coll()).updateOne({ _id: key }, { $set: { key, last_error: String(message).slice(0, 200), last_failed_at: now } }, { upsert: true });
      } catch { /* best effort */ }
    },
    /** True for exactly one caller per window (compare-and-set on last_attempt_at). */
    async claimAttempt(key, now = new Date(), minIntervalMs = MIN_ATTEMPT_MS) {
      const cutoff = new Date(now.getTime() - minIntervalMs);
      try {
        const res = await (await coll()).updateOne(
          { _id: key, $or: [{ last_attempt_at: { $exists: false } }, { last_attempt_at: null }, { last_attempt_at: { $lt: cutoff } }] },
          { $set: { key, last_attempt_at: now } },
          { upsert: true }
        );
        return Boolean(res.matchedCount || res.upsertedCount);
      } catch (error) {
        if (error?.code === 11000) return false; // doc exists but was attempted recently
        throw error;
      }
    },
  };
}

/**
 * Resolve one source: serve the snapshot while fresh; otherwise try to refresh
 * (only if this caller wins the attempt claim); on any failure serve the last
 * good snapshot. Returns { payload, fetchedAt, status, stale, error }.
 *   status: 'fresh' | 'refreshed' | 'snapshot' | 'none'
 */
export async function loadExternal({ key, sourceUrl, fetcher, parse, store, now = Date.now(), freshMs = FRESH_MS, staleMs = STALE_MS, minAttemptMs = MIN_ATTEMPT_MS, allowFetch = true }) {
  let snap = null;
  try {
    snap = await store.read(key);
  } catch (error) {
    // Mongo down: still try the network below only if allowed, otherwise nothing.
    snap = null;
    if (!allowFetch) return { payload: null, fetchedAt: null, status: 'none', stale: true, error: error?.message };
  }
  const ageMs = snap?.fetchedAt ? now - snap.fetchedAt.getTime() : Infinity;
  if (snap?.payload && ageMs < freshMs) {
    return { payload: snap.payload, fetchedAt: snap.fetchedAt, status: 'fresh', stale: false };
  }
  const fallback = (error) => ({
    payload: snap?.payload ?? null,
    fetchedAt: snap?.fetchedAt ?? null,
    status: snap?.payload ? 'snapshot' : 'none',
    stale: !snap?.payload || ageMs > staleMs,
    error,
  });
  if (!allowFetch) return fallback(null);

  let claimed = false;
  try {
    claimed = await store.claimAttempt(key, new Date(now), minAttemptMs);
  } catch {
    claimed = false; // cannot coordinate -> do not fetch
  }
  if (!claimed) return fallback(null);

  try {
    const raw = await fetcher();
    const payload = parse(raw);
    try {
      await store.write(key, { sourceUrl, payload, now: new Date(now) });
    } catch { /* persisting failed; still serve what we have */ }
    return { payload, fetchedAt: new Date(now), status: 'refreshed', stale: false };
  } catch (error) {
    await store.recordFailure(key, error?.message || error, new Date(now));
    return fallback(error?.code || error?.message || 'error');
  }
}
