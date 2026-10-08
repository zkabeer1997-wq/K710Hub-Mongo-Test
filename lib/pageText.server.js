import 'server-only';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { createPageTextCache, createPageTextStore, getPageDef, glossaryOverrideForClient, mergePageText } from './pageText.mjs';
import { resolveHomeLegacy } from './homeCopy.mjs';

const CACHE = Symbol.for('k710.pageTextCache');
async function store() { return createPageTextStore({ coll: await getCollection(COLLECTIONS.PAGE_TEXT) }); }

// Home text used to live in content_blocks (page 'home'). The first time the Home
// registry is read, anything stored there that differs from the code default is
// copied into page_text once (never overwriting saved values), so nothing is lost
// and "Reset to default" really resets. If Mongo refuses the write, the legacy
// values are still used in memory.
async function loadLegacyHome() {
  try {
    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);
    const rows = await coll.find({ page: 'home' }).project({ content: 1, _id: 0 }).toArray();
    return resolveHomeLegacy(rows, getPageDef('home').defaults);
  } catch { return {}; }
}

async function loadDoc(page) {
  const s = await store();
  const doc = await s.getDoc(page);
  if (!getPageDef(page)?.legacy || doc?.legacy_imported) return doc;
  const legacy = await loadLegacyHome();
  try {
    return await s.importLegacy(page, legacy);
  } catch {
    return { ...(doc || {}), page, values: { ...legacy, ...(doc?.values || {}) } };
  }
}

function cache() {
  return (globalThis[CACHE] ||= createPageTextCache(loadDoc));
}

/** Public values for a page (defaults + saved overrides). Cached ~30 s; defaults if Mongo is down. */
export async function getPageText(page) { return cache().get(page); }
export function invalidatePageText(page) { cache().invalidate(page); }

/** Admin-edited glossary terms for the tooltips, or null when the built-in glossary is unchanged. Never throws, never waits long. */
export async function getGlossaryOverride() {
  try {
    const t = await Promise.race([getPageText('glossary'), new Promise((resolve) => setTimeout(() => resolve(null), 1500))]);
    return t ? glossaryOverrideForClient(t.glossary_terms) : null;
  } catch { return null; }
}

/** Admin read (throws if Mongo is unavailable): saved overrides, merged values and last-edit info. */
export async function readPageTextForAdmin(page) {
  const doc = await loadDoc(page);
  return { saved: doc?.values || {}, values: mergePageText(page, doc?.values), updated_at: doc?.updated_at || null, updated_by: doc?.updated_by || null };
}

export async function savePageText(page, validated, updatedBy) {
  await loadDoc(page); // make sure the one-time legacy import happened before the first admin write
  const doc = await (await store()).save(page, validated, updatedBy);
  invalidatePageText(page);
  return doc;
}
