import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../../lib/adminAuth';
import { getCollection } from '../../../../../lib/mongo';
import { COLLECTIONS } from '../../../../../lib/mongoCollections';
import { decodeImageDataUrl, imageResponse } from '../../../../../lib/imageDataUrl.mjs';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// On-demand image bytes for one gallery row. The admin list endpoint returns
// this URL instead of the full base64 blob.
export async function GET(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  const { id } = await paramsPromise;
  if (!ID_RE.test(id || '')) {
    return NextResponse.json({ error: 'Invalid image.' }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    const row = await coll.findOne({ id }, { projection: { image_url: 1 } });
    if (!row) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    const decoded = decodeImageDataUrl(row.image_url);
    if (decoded) return imageResponse(decoded);
    if (/^https:\/\//i.test(String(row.image_url || ''))) {
      return NextResponse.redirect(row.image_url, 302);
    }
    return NextResponse.json({ error: 'Image not available.' }, { status: 404 });
  } catch (error) {
    console.error('admin gallery image failed', error);
    return NextResponse.json({ error: 'Unable to load image.' }, { status: 500 });
  }
}
