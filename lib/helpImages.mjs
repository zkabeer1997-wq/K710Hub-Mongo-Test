// Admin-set picture next to a Help section. Pure/injectable (no Next/Mongo imports).
//   help_section_images: { section_id (unique), site_image_id, alt, caption, side, updated_at, updated_by }
// The picture is a site image (Drive "K710 Website/Help images", served same-origin
// at /api/site-image/<id>). Reads are cached ~30 s and fail open: a Mongo or
// Drive problem shows the Help text without pictures, never an error page.
import { isHelpSectionId } from './helpSections.mjs';
import { SITE_IMAGE_ID_RE, siteImageUrl } from './siteImages.mjs';

export const HELP_IMAGE_CACHE_MS = 30_000;
export const HELP_IMAGE_SIDES = Object.freeze(['right', 'left']);
export const HELP_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const HELP_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const HELP_ALT_EXPLANATION = 'Describe what the picture shows in one short sentence. People who cannot see the picture hear this text.';

export class HelpImageError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'HelpImageError'; this.status = status; }
}

/** Validates the admin input. Returns the clean fields or throws HelpImageError with a plain message. */
export function validateHelpImageInput(input) {
  const sectionId = String(input?.section_id ?? '');
  if (!isHelpSectionId(sectionId)) throw new HelpImageError('Unknown help section.');
  const siteImageId = String(input?.site_image_id ?? '');
  if (!SITE_IMAGE_ID_RE.test(siteImageId)) throw new HelpImageError('Upload or choose an image first.');
  const alt = String(input?.alt ?? '').trim().slice(0, 240);
  if (!alt) throw new HelpImageError('Describe the image (alt text) so people using screen readers know what it shows.');
  const caption = String(input?.caption ?? '').trim().slice(0, 300);
  const side = input?.side == null || input.side === '' ? 'right' : String(input.side);
  if (!HELP_IMAGE_SIDES.includes(side)) throw new HelpImageError('Position must be Right or Left.');
  return { section_id: sectionId, site_image_id: siteImageId, alt, caption, side };
}

/** Public shape: same-origin url + text only (no Drive ids). Null when the row is unusable. */
export function publicHelpImage(doc) {
  if (!doc || !isHelpSectionId(doc.section_id)) return null;
  if (!SITE_IMAGE_ID_RE.test(String(doc.site_image_id || ''))) return null;
  const width = Number(doc.width) > 0 ? Number(doc.width) : null;
  const height = Number(doc.height) > 0 ? Number(doc.height) : null;
  return {
    url: siteImageUrl(doc.site_image_id), alt: String(doc.alt || ''), caption: String(doc.caption || ''),
    side: HELP_IMAGE_SIDES.includes(doc.side) ? doc.side : 'right', width, height,
  };
}

/** { section_id: publicImage } from raw docs. */
export function helpImagesToMap(docs) {
  const map = {};
  for (const doc of docs || []) { const img = publicHelpImage(doc); if (img) map[doc.section_id] = img; }
  return map;
}

/** Rendering decision for the page: each section with its optional picture. */
export function planHelpSections(sections, map) {
  return sections.map((section) => {
    const image = (map && Object.hasOwn(map, section.id) && map[section.id]) || null;
    return { ...section, image, layout: image ? `two-col-${image.side}` : 'single' };
  });
}

export function createHelpImageStore({ coll, siteImages, now = () => new Date() }) {
  return {
    async list() { return coll.find({}).toArray(); },
    async set(input, updatedBy = 'admin') {
      const clean = validateHelpImageInput(input);
      const img = await siteImages.findOne({ _id: clean.site_image_id });
      if (!img || img.folder !== 'help') throw new HelpImageError('That image was not uploaded for the Help page. Upload it again.');
      if (!HELP_IMAGE_TYPES.includes(img.mime)) throw new HelpImageError('Use a PNG, JPG, WebP or GIF image.', 415);
      if (Number(img.size) > HELP_IMAGE_MAX_BYTES) throw new HelpImageError('Help images must be 6 MB or smaller.', 413);
      const doc = { ...clean, width: img.width || null, height: img.height || null, updated_at: now(), updated_by: updatedBy };
      await coll.updateOne({ section_id: clean.section_id }, { $set: doc }, { upsert: true });
      return doc;
    },
    async remove(sectionId) {
      if (!isHelpSectionId(sectionId)) throw new HelpImageError('Unknown help section.');
      const result = await coll.deleteOne({ section_id: sectionId });
      return (result?.deletedCount || 0) > 0;
    },
  };
}

/** 30 s cache around a loader; fails open ({}) and never throws. */
export function createHelpImageCache(load, { ttl = HELP_IMAGE_CACHE_MS, now = () => Date.now() } = {}) {
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
