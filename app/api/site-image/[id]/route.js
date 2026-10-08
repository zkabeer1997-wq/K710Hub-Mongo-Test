import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { deliverSiteImage } from '../../../../lib/siteImages.mjs';
import { placeholderResponse } from '../../../../lib/galleryImageDelivery.mjs';

export const dynamic = 'force-dynamic';

// Same-origin proxy for site images stored in Drive (see lib/siteImages.mjs).
// Hero/tool/guide images are public and cacheable; gallery/application images
// only stream for a signed-in admin. Drive ids never reach the browser.
export async function GET(request, { params }) {
  const { id } = await params;
  let coll;
  try { coll = await getCollection(COLLECTIONS.SITE_IMAGES); } catch { return placeholderResponse(502); }
  return deliverSiteImage({
    id, coll, getDrive: getDriveStorage,
    isAdmin: () => isAdminRequest(request),
    ifNoneMatch: request.headers.get('if-none-match'),
  });
}
