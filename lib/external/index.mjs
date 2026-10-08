// Server entry points used by pages and routes. Wires the Mongo-backed store and
// a short in-process memo so a burst of page views does not even hit Mongo.
import { getCollection } from '../mongo.js';
import { createSnapshotStore, loadExternal } from './snapshotStore.mjs';
import { loadKvkRecord, sourceDefs } from './kvkRecord.mjs';
import { parseTimelineResponse } from './timelineParse.mjs';
import { fetchJson } from './http.mjs';
import { OPTIMIZER_API, PAGES, SNAPSHOT_KEYS } from './sources.mjs';
import { buildChapters } from './timelineProgress.mjs';

const MEMO_MS = 2 * 60 * 1000;
const memo = new Map();

async function memoized(name, fn) {
  const hit = memo.get(name);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const value = await fn();
  memo.set(name, { at: Date.now(), value });
  return value;
}

let storeSingleton = null;
export function getStore() {
  return (storeSingleton ||= createSnapshotStore(getCollection));
}

export function timelineDef({ fetchImpl } = {}) {
  return {
    key: SNAPSHOT_KEYS.timeline,
    sourceUrl: OPTIMIZER_API.timeline.url,
    fetcher: () => fetchJson(OPTIMIZER_API.timeline.url, { method: 'POST', json: OPTIMIZER_API.timeline.body, fetchImpl }),
    parse: parseTimelineResponse,
  };
}

/** Shared by the home page and About page. Never throws. */
export function getKvkRecord() {
  return memoized('kvk', async () => {
    try {
      return await loadKvkRecord({ store: getStore() });
    } catch (error) {
      console.error('getKvkRecord failed', error);
      const { normalizeKvkRecord } = await import('./kvkRecord.mjs');
      return normalizeKvkRecord({});
    }
  });
}

/** Timeline view-model for /timeline and /api/timeline. Never throws. */
export function getTimeline() {
  return memoized('timeline', async () => {
    let res;
    try {
      res = await loadExternal({ ...timelineDef(), store: getStore() });
    } catch (error) {
      console.error('getTimeline failed', error);
      res = { payload: null, fetchedAt: null, status: 'none', stale: true };
    }
    return {
      available: Boolean(res.payload),
      kingdom: res.payload?.kingdom ?? 710,
      createdDate: res.payload?.createdDate ?? null,
      milestones: res.payload?.milestones ?? [],
      fetchedAt: res.fetchedAt ? res.fetchedAt.toISOString() : null,
      status: res.status,
      stale: res.stale,
      sourceUrl: PAGES.timeline,
    };
  });
}

export { buildChapters };

/** Cron: refresh every source now (each still honours the 30 min attempt claim). */
export async function refreshAllExternal({ fetchImpl, store = getStore(), now = Date.now() } = {}) {
  const defs = { timeline: timelineDef({ fetchImpl }), ...sourceDefs({ fetchImpl }) };
  const results = {};
  await Promise.all(Object.entries(defs).map(async ([id, def]) => {
    const r = await loadExternal({ ...def, store, now, freshMs: 0 });
    results[id] = { status: r.status, error: r.error ? String(r.error) : undefined, fetched_at: r.fetchedAt ? r.fetchedAt.toISOString() : null };
  }));
  memo.clear();
  return results;
}
