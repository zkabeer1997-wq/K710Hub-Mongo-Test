import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../../../lib/adminAuth';
import { getCollection } from '../../../../../../lib/mongo';
import { COLLECTIONS } from '../../../../../../lib/mongoCollections';
import { decodeImageDataUrl, imageResponse } from '../../../../../../lib/imageDataUrl.mjs';

export const dynamic = 'force-dynamic';

// On-demand screenshot bytes. The submissions list endpoint never returns the
// base64 blobs; the admin drawer links here instead.
export async function GET(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, index } = await paramsPromise;
  const position = Number(index);
  if (!id || id.length > 64 || !Number.isInteger(position) || position < 0 || position > 20) {
    return NextResponse.json({ error: 'Invalid screenshot.' }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    const row = await coll.findOne(
      { id },
      { projection: { screenshot_urls: { $slice: [position, 1] } } }
    );
    const url = row?.screenshot_urls?.[0];
    if (!url) return NextResponse.json({ error: 'Screenshot not found.' }, { status: 404 });
    const decoded = decodeImageDataUrl(url);
    if (decoded) return imageResponse(decoded);
    if (/^https:\/\//i.test(String(url))) return NextResponse.redirect(url, 302);
    return NextResponse.json({ error: 'Screenshot not available.' }, { status: 404 });
  } catch (error) {
    console.error('interest screenshot failed', error);
    return NextResponse.json({ error: 'Unable to load screenshot.' }, { status: 500 });
  }
}
