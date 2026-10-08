import 'server-only';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { createToolImageStore, createOverrideCache, overridesToMap } from './toolImages.mjs';

const CACHE = Symbol.for('k710.toolImageCache');
function cache() {
  return (globalThis[CACHE] ||= createOverrideCache(async () => overridesToMap(await (await getCollection(COLLECTIONS.TOOL_IMAGES)).find({}).toArray())));
}

/** Public { tool_key: {url, alt} } for /tools. Cached ~30 s; {} (built-in icons) if Mongo is down. */
export async function getToolImageMap() { return cache().get(); }
export function invalidateToolImages() { cache().invalidate(); }

/** Admin store (throws if Mongo is unavailable). */
export async function getToolImageStore() {
  return createToolImageStore({ coll: await getCollection(COLLECTIONS.TOOL_IMAGES), siteImages: await getCollection(COLLECTIONS.SITE_IMAGES) });
}
