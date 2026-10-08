// Shared shaping for gallery_images rows. Lists never carry base64: any
// data: image_url is blanked in the aggregation and replaced with the
// same-origin proxy URL.
export const GALLERY_PROXY_PREFIX = '/api/gallery/image/';

export function galleryProxyUrl(id) { return `${GALLERY_PROXY_PREFIX}${id}`; }

export const GALLERY_LIST_PROJECTION = {
  _id: 0,
  id: 1,
  storage: 1,
  storage_path: 1,
  mime_type: 1,
  width: 1,
  height: 1,
  size: 1,
  title: 1,
  caption: 1,
  alt_text: 1,
  position: 1,
  is_published: 1,
  created_at: 1,
  updated_at: 1,
  has_drive_file: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$drive_file_id', ''] } }, 0] }, true, false] },
  image_url: {
    $cond: [{ $eq: [{ $substrCP: [{ $ifNull: ['$image_url', ''] }, 0, 5] }, 'data:'] }, '', { $ifNull: ['$image_url', ''] }],
  },
};

export function shapeGalleryRow(row) {
  const { has_drive_file: hasDrive, ...rest } = row;
  const external = /^https:\/\//i.test(rest.image_url || '');
  return {
    ...rest,
    storage: hasDrive ? 'drive' : 'db',
    image_url: external && !hasDrive ? rest.image_url : galleryProxyUrl(rest.id),
  };
}

/** Pure Mongo-aggregation helper used by public and admin lists. */
export async function listGalleryRows(coll, { publishedOnly = false, limit } = {}) {
  const pipeline = [];
  if (publishedOnly) pipeline.push({ $match: { is_published: true } });
  pipeline.push({ $sort: { position: 1, created_at: -1 } });
  if (Number.isInteger(limit) && limit > 0) pipeline.push({ $limit: limit });
  pipeline.push({ $project: GALLERY_LIST_PROJECTION });
  const rows = await coll.aggregate(pipeline).toArray();
  return rows.map(shapeGalleryRow);
}
