import 'server-only';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { checkLoreImage, publicStory, sortStories } from './lore.mjs';

/** Published stories, oldest first, in the visitor-safe shape. Never throws (a DB hiccup shows the empty state). */
export async function loadPublishedStories() {
  try {
    const coll = await getCollection(COLLECTIONS.LORE_STORIES);
    const docs = await coll.find({ published: { $ne: false } }).toArray();
    return sortStories(docs).map(publicStory);
  } catch (error) {
    console.error('lore load failed', error?.message || error);
    return [];
  }
}

/**
 * Looks the chosen photo up and adds its stored size to the story fields. A photo that no longer exists is dropped
 * (and reported) instead of blocking the text; one from another folder is refused.
 * Returns { fields, warning?, error? }.
 */
export async function resolveLoreImage(fields) {
  const out = { ...fields };
  if (!out.image_id) {
    if (out.image_id === '') { out.image_width = null; out.image_height = null; }
    return { fields: out };
  }
  const { state, doc } = await checkLoreImage(await getCollection(COLLECTIONS.SITE_IMAGES), out.image_id);
  if (state === 'wrong-folder') return { fields: out, error: 'Story photo is invalid.' };
  if (state === 'missing') {
    return { fields: { ...out, image_id: '', image_alt: '', image_width: null, image_height: null }, warning: 'The photo was no longer available, so the story was saved without it.' };
  }
  out.image_width = Number(doc.width) > 0 ? Number(doc.width) : null;
  out.image_height = Number(doc.height) > 0 ? Number(doc.height) : null;
  return { fields: out };
}

/** Removes the Drive file + record of a no-longer-used lore photo (best effort). */
export async function removeLorePhoto(id) {
  const { getSiteImages } = await import('./siteImages.server');
  return (await getSiteImages({ requireConnected: false })).remove(id, { folders: ['lore'] });
}
