import 'server-only';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { createPageTextCache, createPageTextStore, mergePageText } from './pageText.mjs';

const CACHE = Symbol.for('k710.pageTextCache');
async function store() { return createPageTextStore({ coll: await getCollection(COLLECTIONS.PAGE_TEXT) }); }
function cache() {
  return (globalThis[CACHE] ||= createPageTextCache(async (page) => (await store()).getDoc(page)));
}

/** Public values for a page (defaults + saved overrides). Cached ~30 s; defaults if Mongo is down. */
export async function getPageText(page) { return cache().get(page); }
export function invalidatePageText(page) { cache().invalidate(page); }

/** Admin read (throws if Mongo is unavailable): saved overrides, merged values and last-edit info. */
export async function readPageTextForAdmin(page) {
  const doc = await (await store()).getDoc(page);
  return { saved: doc?.values || {}, values: mergePageText(page, doc?.values), updated_at: doc?.updated_at || null, updated_by: doc?.updated_by || null };
}

export async function savePageText(page, validated, updatedBy) {
  const doc = await (await store()).save(page, validated, updatedBy);
  invalidatePageText(page);
  return doc;
}
