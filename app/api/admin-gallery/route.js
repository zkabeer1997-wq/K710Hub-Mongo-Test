import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { randomUUID } from 'node:crypto';
import { getSiteImages, SiteImageError } from '../../../lib/siteImages.server';
import { listGalleryRows } from '../../../lib/galleryRows.mjs';
import { GALLERY_MAX_FILE_SIZE, galleryDocFromSiteImage, validateGalleryFields, validateGalleryUpload } from '../../../lib/galleryUpload.mjs';

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
  const pickedId = String(formData.get('drive_file_id') || '').trim();
  const title = String(formData.get('title') || '').trim();
  const caption = String(formData.get('caption') || '').trim();
  const altText = String(formData.get('alt_text') || '').trim();
  const position = Number(formData.get('position') || 0);
  const isPublished = String(formData.get('is_published')) !== 'false';
  const fields = { title, caption, altText, position, isPublished };

  // Two ways in: a file from this computer, or a file picked in Google Drive.
  // Either way the image ends up in Drive "K710 Website/Gallery images"; the
  // database only keeps metadata.
  let buffer = null;
  if (pickedId) {
    const checked = validateGalleryFields({ title, caption, altText, position });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  } else {
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    const checked = validateGalleryUpload({ file, buffer, title, caption, altText, position });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  }

  let images;
  let record;
  try {
    images = await getSiteImages();
    record = pickedId
      ? await images.copyPicked({ folder: 'gallery', fileId: pickedId, alt: altText, maxBytes: GALLERY_MAX_FILE_SIZE })
      : await images.store({ folder: 'gallery', file: { bytes: buffer, type: file.type }, name: `${randomUUID()}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`, alt: altText, maxBytes: GALLERY_MAX_FILE_SIZE });
  } catch (error) {
    if (error instanceof SiteImageError) {
      return NextResponse.json({ error: error.message, ...(error.needsConnect ? { needsConnect: true } : {}) }, { status: error.status });
    }
    console.error('gallery drive upload failed', error);
    return NextResponse.json({ error: 'The image could not be uploaded to Google Drive.' }, { status: 502 });
  }
  const doc = galleryDocFromSiteImage(record, fields);
  const drive = images.drive;

  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    await coll.insertOne({ ...doc });
    const { _id, drive_file_id, drive_md5, site_image_id, ...image } = doc;
    revalidatePath('/');
    revalidatePath('/gallery');
    return NextResponse.json({ image: { ...image, image_url: `/api/gallery/image/${doc.id}` } }, { status: 201 });
  } catch (error) {
    console.error('gallery record insert failed', error);
    try { await images.remove(String(record._id)); } catch { /* orphan stays in the Drive folder */ }
    return NextResponse.json({ error: 'The image could not be added to the gallery.' }, { status: 500 });
  }
}
