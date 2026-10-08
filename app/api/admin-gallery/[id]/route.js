import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { getDriveStorage } from '../../../../lib/driveStorage.server';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  return null;
}

export async function PATCH(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { id } = await paramsPromise;
  if (!ID_RE.test(id || '')) {
    return NextResponse.json({ error: 'Invalid image.' }, { status: 400 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const title = String(payload?.title || '').trim();
  const caption = String(payload?.caption || '').trim();
  const altText = String(payload?.alt_text || '').trim();
  const position = Number(payload?.position);
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

  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    const result = await coll.findOneAndUpdate(
      { id },
      {
        $set: {
          title,
          caption,
          alt_text: altText,
          position,
          is_published: Boolean(payload?.is_published),
          updated_at: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    const doc = result?.value || result;
    if (!doc) {
      return NextResponse.json({ error: 'Unable to update this image.' }, { status: 500 });
    }
    const { _id, image_url: _blob, drive_file_id, drive_md5, ...image } = doc;
    image.image_url = `/api/gallery/image/${doc.id}`;
    revalidatePath('/');
    revalidatePath('/gallery');
    return NextResponse.json({ image });
  } catch {
    return NextResponse.json({ error: 'Unable to update this image.' }, { status: 500 });
  }
}

export async function DELETE(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { id } = await paramsPromise;
  if (!ID_RE.test(id || '')) {
    return NextResponse.json({ error: 'Invalid image.' }, { status: 400 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    const image = await coll.findOne({ id });
    if (!image) {
      return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    }
    // Drive-backed rows: move the file to the Drive trash (recoverable for
    // 30 days), never a permanent delete. A Drive failure does not block
    // removing the record; the response says so.
    let driveTrashed = null;
    if (image.drive_file_id) {
      try {
        const drive = await getDriveStorage();
        await drive.trashFile(image.drive_file_id);
        driveTrashed = true;
      } catch (error) {
        driveTrashed = error?.code === 'not_found';
        if (!driveTrashed) console.error('gallery drive trash failed', error?.code || error?.message);
      }
    }
    await coll.deleteOne({ id });
    revalidatePath('/');
    revalidatePath('/gallery');
    return NextResponse.json({
      ok: true,
      driveTrashed,
      ...(driveTrashed === false ? { warning: 'The gallery record was removed, but the Drive file could not be moved to the trash. You can delete it from the K710 Gallery folder in Drive.' } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'The gallery record could not be removed.' }, { status: 500 });
  }
}
