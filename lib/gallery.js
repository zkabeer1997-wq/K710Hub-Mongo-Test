import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { listGalleryRows } from './galleryRows.mjs';

// Public gallery list: metadata plus same-origin proxy URLs only. No base64
// blobs and no Drive ids ever leave the server here.
export async function getGalleryImages({ publishedOnly = true, limit } = {}) {
  const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
  const rows = await listGalleryRows(coll, { publishedOnly, limit });
  return rows.map(({ storage, storage_path, mime_type, width, height, size, ...image }) => ({
    ...image,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  }));
}
