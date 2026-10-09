// Alliance photos: one optional site image (folder 'alliance') per alliance, stored as `image_id`
// (+ `image_alt`) on the alliance doc. Shown on the landing box and as the page banner.
// Pure and injectable (no Next/Mongo imports) so it is unit tested; wiring is in the admin-alliances routes.
import { SITE_IMAGE_ID_RE } from './siteImageId.mjs';
import { NO_PLACEHOLDER_QUERY, siteImageUrl } from './siteImages.mjs';

export const ALLIANCE_IMAGE_FOLDER = 'alliance';
export const ALLIANCE_IMAGE_WIDTH = 1600;
export const ALLIANCE_IMAGE_HEIGHT = 900;
export const ALLIANCE_IMAGE_ASPECT = ALLIANCE_IMAGE_WIDTH / ALLIANCE_IMAGE_HEIGHT;
export const ALLIANCE_IMAGE_MIN_WIDTH = 800;
export const ALLIANCE_IMAGE_MIN_HEIGHT = 450;
/** Uploads from our editor are 1600x900 WebP/JPEG, normally a few hundred KB. */
export const ALLIANCE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const ALLIANCE_ALT_MAX = 240;

/** Public photo url, or '' when the alliance has no (valid) photo. Failures return an error status, not the SVG placeholder. */
export function allianceImageUrl(imageId) {
  return typeof imageId === 'string' && SITE_IMAGE_ID_RE.test(imageId) ? `${siteImageUrl(imageId)}?${NO_PLACEHOLDER_QUERY}` : '';
}

/**
 * Reads the optional photo fields of an admin request body.
 * Returns only what was sent: `{}` when neither field is present (an old client must never clear the photo),
 * `image_id: ''` when the admin removed it (which also clears the description).
 */
export function parseAllianceImageFields(body) {
  const out = {};
  if (!body || typeof body !== 'object') return { fields: out };
  if (body.image_id !== undefined && body.image_id !== null && typeof body.image_id !== 'string') return { fields: out, error: 'Alliance photo is invalid.' };
  if (body.image_id !== undefined) {
    const id = body.image_id === null ? '' : body.image_id.trim();
    if (id && !SITE_IMAGE_ID_RE.test(id)) return { fields: out, error: 'Alliance photo is invalid.' };
    out.image_id = id;
  }
  if (body.image_alt !== undefined) {
    if (body.image_alt !== null && typeof body.image_alt !== 'string') return { fields: out, error: 'Photo description is invalid.' };
    out.image_alt = String(body.image_alt ?? '').trim().slice(0, ALLIANCE_ALT_MAX);
  }
  if (out.image_id === '') out.image_alt = ''; // no photo, no description
  return { fields: out };
}

/** 'ok' (a real alliance photo), 'missing' (no such site image) or 'wrong-folder' (another folder's image). */
export async function checkAllianceImage(siteImages, imageId) {
  if (!imageId) return 'missing';
  const doc = await siteImages.findOne({ _id: String(imageId) });
  if (!doc) return 'missing';
  return doc.folder === ALLIANCE_IMAGE_FOLDER ? 'ok' : 'wrong-folder';
}

/**
 * After a photo changed or the alliance was removed: delete the old photo only when no other alliance
 * still uses it. Never throws: a Drive hiccup must not block saving text.
 */
export async function releaseAllianceImage({ alliances, imageId, removeImage }) {
  if (!imageId || !SITE_IMAGE_ID_RE.test(String(imageId))) return false;
  try {
    if (await alliances.findOne({ image_id: imageId })) return false;
    return Boolean(await removeImage(imageId));
  } catch (error) {
    console.error('alliance photo cleanup failed', error?.message || error);
    return false;
  }
}
