// Tool image overrides for the Tools & Calculators tiles. Pure/injectable (no Next/Mongo imports).
//   tool_images: { tool_key (unique), site_image_id, alt, updated_at, updated_by }
// The image itself is a site image (Drive folder "Tools and calculators images",
// served same-origin at /api/site-image/<id>). No override = the built-in icon.
import { TOOL_KEYS } from './toolHubTools.mjs';
import { SITE_IMAGE_ID_RE, siteImageUrl } from './siteImages.mjs';

export const TOOL_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const TOOL_IMAGE_CACHE_MS = 30_000;
export const TOOL_IMAGE_HINT = 'Square, at least 256x256; PNG, JPG or WebP; up to 4 MB.';

export class ToolImageError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'ToolImageError'; this.status = status; }
}

export const isToolKey = (key) => typeof key === 'string' && TOOL_KEYS.includes(key);

/** Public shape for a tile: same-origin url + alt only (no Drive ids). */
export function publicToolImage(doc) {
  if (!doc?.site_image_id || !SITE_IMAGE_ID_RE.test(String(doc.site_image_id))) return null;
  return { url: siteImageUrl(doc.site_image_id), alt: String(doc.alt || '') };
}

/** { tool_key: {url, alt} } for tiles from raw override docs. */
export function overridesToMap(docs) {
  const map = {};
  for (const doc of docs || []) { const img = publicToolImage(doc); if (img && isToolKey(doc.tool_key)) map[doc.tool_key] = img; }
  return map;
}

/** Tile resolution: the override replaces the default; null means "use the built-in icon". */
export function resolveToolImage(map, toolKey) { return (map && Object.hasOwn(map, toolKey) && map[toolKey]) || null; }

export function createToolImageStore({ coll, siteImages, now = () => new Date() }) {
  return {
    async list() { return coll.find({}).toArray(); },
    async set({ toolKey, siteImageId, alt, updatedBy = 'admin' }) {
      if (!isToolKey(toolKey)) throw new ToolImageError('Unknown tool.');
      const cleanAlt = String(alt || '').trim().slice(0, 240);
      if (!cleanAlt) throw new ToolImageError('Describe the image (alt text) so people using screen readers know what it shows.');
      if (!SITE_IMAGE_ID_RE.test(String(siteImageId || ''))) throw new ToolImageError('Upload or choose an image first.');
      const img = await siteImages.findOne({ _id: String(siteImageId) });
      if (!img || img.folder !== 'tool') throw new ToolImageError('That image was not uploaded for tools. Upload it again.');
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(img.mime)) throw new ToolImageError('Use a PNG, JPG or WebP image.', 415);
      if (Number(img.size) > TOOL_IMAGE_MAX_BYTES) throw new ToolImageError('Tool images must be 4 MB or smaller.', 413);
      const doc = { tool_key: toolKey, site_image_id: String(siteImageId), alt: cleanAlt, updated_at: now(), updated_by: updatedBy };
      await coll.updateOne({ tool_key: toolKey }, { $set: doc }, { upsert: true });
      return doc;
    },
    async reset(toolKey) {
      if (!isToolKey(toolKey)) throw new ToolImageError('Unknown tool.');
      const result = await coll.deleteOne({ tool_key: toolKey });
      return (result?.deletedCount || 0) > 0;
    },
  };
}

/** 30 s cache around a loader; fails open ({}) and never throws. */
export function createOverrideCache(load, { ttl = TOOL_IMAGE_CACHE_MS, now = () => Date.now() } = {}) {
  let entry = null;
  return {
    async get() {
      if (entry && now() - entry.at < ttl) return entry.map;
      try { const map = await load(); entry = { at: now(), map }; return map; }
      catch { return entry?.map || {}; }
    },
    invalidate() { entry = null; },
  };
}
