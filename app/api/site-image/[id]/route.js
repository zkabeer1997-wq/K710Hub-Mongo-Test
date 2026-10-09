import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { readMemberSession } from '../../../../lib/memberAuth';
import { guidesTable } from '../../../../lib/guideAccess.mjs';
import { guideImageAccess } from '../../../../lib/guideImages.mjs';
import { deliverSiteImage, withoutPlaceholder } from '../../../../lib/siteImages.mjs';
import { placeholderResponse } from '../../../../lib/galleryImageDelivery.mjs';

export const dynamic = 'force-dynamic';

// Same-origin proxy for site images stored in Drive (see lib/siteImages.mjs).
// Hero/tool/guide images are public and cacheable; gallery/application images
// only stream for a signed-in admin. Drive ids never reach the browser.
export async function GET(request, { params }) {
  const { id } = await params;
  let coll;
  const strict = new URL(request.url || 'http://localhost').searchParams.get('fallback') === 'none';
  try { coll = await getCollection(COLLECTIONS.SITE_IMAGES); } catch { return withoutPlaceholder(placeholderResponse(502), strict); }
  return withoutPlaceholder(await deliverSiteImage({
    id, coll, getDrive: getDriveStorage,
    isAdmin: () => isAdminRequest(request),
    isMember: async () => Boolean(await readMemberSession(request)),
    guideAccess: async (imageId) => {
      const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
      const guides = await getCollection(table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES);
      const rows = await guides.find({ $or: [{ image_id: imageId }, { 'draft.image_id': imageId }] }).project({ image_id: 1, is_published: 1, access_level: 1, 'draft.image_id': 1, 'draft.access_level': 1, _id: 0 }).toArray();
      return guideImageAccess(rows, imageId);
    },
    ifNoneMatch: request.headers.get('if-none-match'),
  }), strict);
}
