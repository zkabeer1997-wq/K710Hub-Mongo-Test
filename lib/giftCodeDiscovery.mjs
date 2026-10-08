// Gift code discovery: reads the public code lists (kingshot.net primary, kingshotmastery.com
// secondary when enabled), merges them and writes the `gift_codes` collection.
// Safety rules: a failed source never deletes or expires anything; codes are only marked
// "no longer listed" when every source that used to list them succeeded with a non-empty list.
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getStore } from './external/index.mjs';
import { loadExternal } from './external/snapshotStore.mjs';
import { FRESH_MS, MIN_ATTEMPT_MS } from './external/sources.mjs';
import {
  GIFT_BLOCKED_PAUSE_MS,
  GIFT_SOURCES,
  codeKey,
  enabledGiftSources,
  fetchGiftSource,
  mergeSourceResults,
  normalizeCode,
  snapshotKeyFor,
} from './external/giftCodeSources.mjs';

const PRIORITY = GIFT_SOURCES.map((s) => s.id);

/**
 * Refresh every enabled source (each limited to one attempt per 30 minutes unless `force`),
 * then merge the results into gift_codes. Never throws for a source failure.
 */
export async function refreshGiftCodes({ force = false, fetchImpl, store = getStore(), coll, env = process.env, now = Date.now() } = {}) {
  const enabled = enabledGiftSources(env);
  const sources = {};
  const results = [];
  const succeeded = new Set(); // sources that returned a successful, NON-EMPTY parse in this run
  let refreshed = 0;

  for (const source of enabled) {
    const key = snapshotKeyFor(source.id);
    let failure = null;
    let snap = null;
    try { snap = await store.read(key); } catch { snap = null; }
    // 401/403/429 means "go away": do not touch the site again for a day, not even on force.
    if (snap?.lastError?.startsWith('blocked:') && snap.lastAttemptAt && now - snap.lastAttemptAt.getTime() < GIFT_BLOCKED_PAUSE_MS) {
      sources[source.id] = { status: 'paused_blocked', error: snap.lastError };
      if (snap.payload) results.push({ source: source.id, codes: snap.payload.codes || [] });
      continue;
    }
    const r = await loadExternal({
      key,
      sourceUrl: source.url,
      fetcher: async () => {
        try {
          return await fetchGiftSource(source, { fetchImpl, now });
        } catch (error) {
          failure = error;
          throw error;
        }
      },
      parse: (x) => x,
      store,
      now,
      freshMs: 0, // cron/admin always want to try; the 30 minute claim is the real limiter
      minAttemptMs: force ? 0 : MIN_ATTEMPT_MS,
    });
    sources[source.id] = {
      status: r.status,
      error: failure ? failure.message : undefined,
      codes: r.payload?.codes?.length ?? 0,
      fetched_at: r.fetchedAt ? r.fetchedAt.toISOString() : null,
    };
    if (r.payload) results.push({ source: source.id, codes: r.payload.codes || [] });
    if (r.status === 'refreshed') {
      refreshed += 1;
      if ((r.payload.codes || []).length > 0) succeeded.add(source.id);
    }
  }

  let applied = { new_codes: 0, updated: 0, delisted: 0, total_listed: 0 };
  // Only touch gift_codes when at least one source really answered in this run.
  if (refreshed > 0) {
    const merged = mergeSourceResults(results.sort((a, b) => PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source)));
    applied = await applyMergedCodes(coll || (await getCollection(COLLECTIONS.GIFT_CODES)), merged, { succeeded, now: new Date(now) });
  }
  return { ok: true, refreshed, sources, ...applied };
}

/** Write merged codes to gift_codes; see the module header for the safety rules. */
export async function applyMergedCodes(coll, merged, { succeeded = new Set(), now = new Date() } = {}) {
  const existing = await coll.find({}).toArray();
  const byKey = new Map(existing.map((d) => [codeKey(d.code), d]));
  const listedKeys = new Set(merged.map((m) => codeKey(m.code)));
  let newCodes = 0;
  let updated = 0;
  let delisted = 0;

  for (const m of merged) {
    const doc = byKey.get(codeKey(m.code));
    const base = {
      sources: m.sources,
      source_seen_at: now,
      rewards: m.rewards,
      expires_at: m.expires_at ? new Date(m.expires_at) : null,
      updated_at: now,
    };
    if (!doc) {
      await coll.updateOne(
        { code: m.code },
        {
          $set: { ...base, code: m.code, source: m.sources[0], active: true, expired_at: null, discovered_at: now, listed_at: m.added_at ? new Date(m.added_at) : null },
          $setOnInsert: { created_at: now },
        },
        { upsert: true },
      );
      newCodes += 1;
      continue;
    }
    const set = { ...base };
    if (doc.source === 'manual') set.sources = ['manual', ...m.sources];
    // Re-activate only codes WE switched off because they dropped off the list; never an admin's manual "Off".
    if (doc.active === false && doc.expired_reason === 'delisted') {
      set.active = true;
      set.expired_at = null;
      set.expired_reason = null;
    }
    // A manual code that a source also lists keeps source "manual" (and its own rewards text) but records who else listed it.
    if (doc.rewards && (!doc.source || doc.source === 'manual')) delete set.rewards;
    await coll.updateOne({ _id: doc._id }, { $set: set });
    updated += 1;
  }

  for (const doc of existing) {
    if (doc.active === false) continue;
    if (listedKeys.has(codeKey(doc.code))) continue;
    if (doc.source === 'manual') continue; // hand-added codes are only ever switched off by an admin
    const origins = Array.isArray(doc.sources) && doc.sources.length ? doc.sources : [doc.source];
    // Manual / test codes and codes listed by a source that failed this run stay untouched.
    if (!origins.length || !origins.every((s) => succeeded.has(s))) continue;
    await coll.updateOne({ _id: doc._id }, { $set: { active: false, expired_at: now, expired_reason: 'delisted', updated_at: now } });
    delisted += 1;
  }
  return { new_codes: newCodes, updated, delisted, total_listed: merged.length };
}

/** Bulk add by hand (admin paste box). Accepts codes separated by whitespace, commas or semicolons. */
export function parseCodeList(text) {
  const parts = String(text || '').replace(/<[^>]*>/g, ' ').split(/[\s,;|]+/);
  const valid = [];
  const rejected = [];
  const seen = new Set();
  for (const part of parts) {
    if (!part) continue;
    const code = normalizeCode(part);
    if (!code) { if (rejected.length < 20) rejected.push(part.slice(0, 40)); continue; }
    const key = codeKey(code);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(code);
  }
  return { valid: valid.slice(0, 100), rejected };
}

export async function addManualCodes(coll, codes, { notes = null, now = new Date() } = {}) {
  const existing = await coll.find({}).toArray();
  const byKey = new Map(existing.map((d) => [codeKey(d.code), d]));
  let added = 0;
  let reactivated = 0;
  let already = 0;
  for (const code of codes) {
    const doc = byKey.get(codeKey(code));
    if (doc) {
      if (doc.active === false) {
        await coll.updateOne({ _id: doc._id }, { $set: { active: true, expired_at: null, expired_reason: null, updated_at: now } });
        reactivated += 1;
      } else already += 1;
      continue;
    }
    await coll.updateOne(
      { code },
      { $set: { code, source: 'manual', sources: ['manual'], source_seen_at: now, active: true, discovered_at: now, updated_at: now, notes }, $setOnInsert: { created_at: now } },
      { upsert: true },
    );
    added += 1;
  }
  return { added, reactivated, already };
}

const RESULT_LABEL = { blocked: 'blocked', robots: 'blocked', shape: 'changed_shape', failed: 'failed' };

/** Read-only status for the admin page and the member hint: no network. */
export async function getGiftSourceStatuses({ store = getStore(), env = process.env, now = Date.now() } = {}) {
  const enabledIds = new Set(enabledGiftSources(env).map((s) => s.id));
  const out = [];
  for (const source of GIFT_SOURCES) {
    let snap = null;
    try { snap = await store.read(snapshotKeyFor(source.id)); } catch { snap = null; }
    const tag = snap?.lastError ? String(snap.lastError).split(':')[0] : null;
    let result = 'never_checked';
    if (!enabledIds.has(source.id)) result = 'not_used';
    else if (tag) result = RESULT_LABEL[tag] || 'failed';
    else if (snap?.payload) result = 'ok';
    out.push({
      id: source.id,
      label: source.label,
      url: source.url,
      enabled: enabledIds.has(source.id),
      note: source.note,
      result,
      error: snap?.lastError || null,
      last_checked_at: (snap?.lastAttemptAt || snap?.fetchedAt)?.toISOString?.() || null,
      last_ok_at: snap?.fetchedAt?.toISOString?.() || null,
      codes_found: snap?.payload?.codes?.length ?? null,
      next_allowed_at: snap?.lastAttemptAt ? new Date(snap.lastAttemptAt.getTime() + MIN_ATTEMPT_MS).toISOString() : null,
      paused_until: tag === 'blocked' && snap?.lastAttemptAt ? new Date(snap.lastAttemptAt.getTime() + GIFT_BLOCKED_PAUSE_MS).toISOString() : null,
      fresh: Boolean(snap?.fetchedAt && now - snap.fetchedAt.getTime() < FRESH_MS),
    });
  }
  return out;
}
