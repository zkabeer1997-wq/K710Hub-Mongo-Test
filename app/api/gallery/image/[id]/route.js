import { isAdminRequest } from '../../../../../lib/adminAuth';
import { getCollection } from '../../../../../lib/mongo';
import { COLLECTIONS } from '../../../../../lib/mongoCollections';
import { getDriveStorage } from '../../../../../lib/driveStorage.server';
import { deliverGalleryImage } from '../../../../../lib/galleryImageDelivery.mjs';

export const dynamic = 'force-dynamic';

// Public same-origin gallery image proxy. Published images are cacheable by
// anyone; unpublished ones only stream for a signed-in admin (preview).
export async function GET(request, { params: paramsPromise }) {
  const { id } = await paramsPromise;
  let coll;
  try { coll = await getCollection(COLLECTIONS.GALLERY_IMAGES); } catch {
    const { placeholderResponse } = await import('../../../../../lib/galleryImageDelivery.mjs');
    return placeholderResponse(502);
  }
  return deliverGalleryImage({
    id,
    coll,
    getDrive: getDriveStorage,
    isAdmin: () => isAdminRequest(request),
    ifNoneMatch: request.headers.get('if-none-match'),
  });
}
