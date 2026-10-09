// Guide card pictures: one optional site image (folder 'guide') per guide, stored as `image_id` on
// the guide doc and shown in place of the book icon on /guides. Pure and injectable (no Next/Mongo
// imports) so it is unit tested. Server wiring lives in the admin-guides routes.
import { SITE_IMAGE_ID_RE } from './siteImageId.mjs';
import { NO_PLACEHOLDER_QUERY, siteImageUrl } from './siteImages.mjs';

export { GUIDE_IMAGE_SIZE, GUIDE_IMAGE_MIN_SIDE, squareCropRect } from './squareCrop.mjs';
export const GUIDE_IMAGE_FOLDER = 'guide';

/** Public card url, or '' when the guide has no (valid) picture. Failures return an error status, not the SVG placeholder. */
export function guideCardImageUrl(imageId) {
  return typeof imageId === 'string' && SITE_IMAGE_ID_RE.test(imageId) ? `${siteImageUrl(imageId)}?${NO_PLACEHOLDER_QUERY}` : '';
}

/** True when the id is a real site image in the guides folder; anything else means "show the icon". */
export async function guideImageExists(siteImages, imageId) {
  if (!imageId) return false;
  const doc = await siteImages.findOne({ _id: String(imageId) });
  return Boolean(doc && doc.folder === GUIDE_IMAGE_FOLDER);
}

/**
 * After a guide's picture changed or the guide was removed: delete the old picture only when no
 * guide (live or draft) still uses it. Never throws: a Drive hiccup must not block saving text.
 */
export async function releaseGuideImage({ guides, imageId, removeImage }) {
  if (!imageId || !SITE_IMAGE_ID_RE.test(String(imageId))) return false;
  try {
    const stillUsed = await guides.findOne({ $or: [{ image_id: imageId }, { 'draft.image_id': imageId }] });
    if (stillUsed) return false;
    return Boolean(await removeImage(imageId));
  } catch (error) {
    console.error('guide picture cleanup failed', error?.message || error);
    return false;
  }
}
