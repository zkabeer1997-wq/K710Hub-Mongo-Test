import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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
    const data = await coll
      .find({})
      .project({
        id: 1,
        image_url: 1,
        storage_path: 1,
        title: 1,
        caption: 1,
        alt_text: 1,
        position: 1,
        is_published: 1,
        created_at: 1,
        updated_at: 1,
        _id: 0,
      })
      .sort({ position: 1, created_at: -1 })
      .toArray();
    return NextResponse.json(
      { images: data || [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
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
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Use a JPG, PNG, WebP, or GIF image.' }, { status: 415 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Images must be 10 MB or smaller.' }, { status: 413 });
  }
  if (!altText || altText.length > 240) {
    return NextResponse.json(
      { error: 'Image description is required and must be 240 characters or fewer.' },
      { status: 400 }
    );
  }
  if (title.length > 120 || caption.length > 500) {
    return NextResponse.json({ error: 'Title or caption is too long.' }, { status: 400 });
  }
  if (!Number.isInteger(position) || position < 0 || position > 100000) {
    return NextResponse.json(
      { error: 'Position must be a whole number between 0 and 100000.' },
      { status: 400 }
    );
  }

  // Mongo test stack: store as data URL (no Supabase Storage).
  // Existing production images already have public image_url values.
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
  const storagePath = `mongo/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;

  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    const doc = {
      id: randomUUID(),
      storage_path: storagePath,
      image_url: dataUrl,
      title,
      caption,
      alt_text: altText,
      position,
      is_published: isPublished,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await coll.insertOne(doc);
    const { _id, ...image } = doc;
    revalidatePath('/');
    revalidatePath('/gallery');
    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    console.error('gallery record insert failed', error);
    return NextResponse.json(
      { error: 'The image could not be added to the gallery.' },
      { status: 500 }
    );
  }
}
