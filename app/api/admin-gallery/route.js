import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { getDriveStorage } from '../../../lib/driveStorage.server';
import { listGalleryRows } from '../../../lib/galleryRows.mjs';
import { CONNECT_DRIVE_MESSAGE, storeGalleryImageInDrive, validateGalleryUpload } from '../../../lib/galleryUpload.mjs';

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    // Metadata + same-origin proxy URLs only; base64 never ships in the list.
    const images = await listGalleryRows(coll);
    return NextResponse.json({ images }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('admin gallery GET failed', error);
    return NextResponse.json({ error: 'Unable to load gallery images.' }, { status: 500 });
  }
}

export async function POST(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }

  const file = formData.get('file');
  const title = String(formData.get('title') || '').trim();
  const caption = String(formData.get('caption') || '').trim();
  const altText = String(formData.get('alt_text') || '').trim();
  const position = Number(formData.get('position') || 0);
  const isPublished = String(formData.get('is_published')) !== 'false';

  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const checked = validateGalleryUpload({ file, buffer, title, caption, altText, position });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  // Images live in Google Drive, never in MongoDB. No silent DB fallback.
  let drive;
  try {
    drive = await getDriveStorage();
    const status = await drive.getStatus();
    if (!status.connected) {
      return NextResponse.json({ error: CONNECT_DRIVE_MESSAGE, needsConnect: true }, { status: 409 });
    }
  } catch (error) {
    console.error('gallery drive status failed', error);
    return NextResponse.json({ error: 'Google Drive is unavailable right now.' }, { status: 502 });
  }

  let doc;
  try {
    doc = await storeGalleryImageInDrive({ drive, buffer, mimeType: file.type, title, caption, altText, position, isPublished });
  } catch (error) {
    console.error('gallery drive upload failed', error);
    if (error?.code === 'reauth' || error?.code === 'not_connected') {
      return NextResponse.json({ error: 'Google Drive needs to be reconnected.', needsConnect: true }, { status: 409 });
    }
    return NextResponse.json({ error: 'The image could not be uploaded to Google Drive.' }, { status: 502 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    await coll.insertOne({ ...doc });
    const { _id, drive_file_id, drive_md5, ...image } = doc;
    revalidatePath('/');
    revalidatePath('/gallery');
    return NextResponse.json({ image: { ...image, image_url: `/api/gallery/image/${doc.id}` } }, { status: 201 });
  } catch (error) {
    console.error('gallery record insert failed', error);
    try { await drive.trashFile(doc.drive_file_id); } catch { /* orphan stays in the Drive folder */ }
    return NextResponse.json({ error: 'The image could not be added to the gallery.' }, { status: 500 });
  }
}
