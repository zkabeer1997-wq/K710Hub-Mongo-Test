import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

export async function getGalleryImages({ publishedOnly = true, limit } = {}) {
  const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
  const filter = {};
  if (publishedOnly) filter.is_published = true;

  let cursor = coll
    .find(filter)
    .project({
      id: 1,
      image_url: 1,
      storage_path: 1,
      title: 1,
      caption: 1,
      alt_text: 1,
      position: 1,
      is_published: 1,
      created_at: 1,
      updated_at: 1,
      _id: 1,
    })
    .sort({ position: 1, created_at: -1 });

  if (Number.isInteger(limit) && limit > 0) cursor = cursor.limit(limit);

  const data = await cursor.toArray();
  return (data || []).map(({ _id, id, ...rest }) => ({
    id: id || String(_id),
    ...rest,
  }));
}
