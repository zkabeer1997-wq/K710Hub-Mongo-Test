import 'server-only';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { createHelpImageStore, createHelpImageCache, helpImagesToMap } from './helpImages.mjs';

const CACHE = Symbol.for('k710.helpImageCache');
function cache() {
  return (globalThis[CACHE] ||= createHelpImageCache(async () => helpImagesToMap(await (await getCollection(COLLECTIONS.HELP_SECTION_IMAGES)).find({}).toArray())));
}

/** Public { section_id: {url, alt, caption, side, width, height} } for /help. Cached ~30 s; {} if Mongo is down. */
export async function getHelpImageMap() { return cache().get(); }
export function invalidateHelpImages() { cache().invalidate(); }

/** Admin store (throws if Mongo is unavailable). */
export async function getHelpImageStore() {
  return createHelpImageStore({ coll: await getCollection(COLLECTIONS.HELP_SECTION_IMAGES), siteImages: await getCollection(COLLECTIONS.SITE_IMAGES) });
}
