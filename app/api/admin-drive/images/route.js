import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { ALLIANCE_IMAGE_MAX_BYTES } from '../../../../lib/allianceImages.mjs';
import { getSiteImages, publicSiteImage, SiteImageError } from '../../../../lib/siteImages.server';

export const dynamic = 'force-dynamic';

// Generic admin upload for the shared ImageUploadField (hero + tool images).
// Gallery and guide images have their own routes (extra metadata) but use the
// same store. POST multipart { folder, file, alt?, subfolder? }
//            or JSON      { folder, driveFileId, alt?, subfolder? } (Google Picker copy)
const ALLOWED = ['hero', 'tool', 'help', 'guide', 'alliance'];
// Guide card pictures are cropped to 512x512 in the browser, so a direct upload over 2 MB is not
// from our editor. Picker copies keep the default cap because the browser crops them afterwards.
// Alliance photos are cropped to 1600x900 in the browser and get the same 2 MB cap.
const UPLOAD_MAX_BYTES = { guide: 2 * 1024 * 1024, alliance: ALLIANCE_IMAGE_MAX_BYTES };

function fail(error) {
  if (error instanceof SiteImageError || error?.name === 'FolderNameError') {
    return NextResponse.json({ error: error.message, ...(error.needsConnect ? { needsConnect: true } : {}) }, { status: error.status || 400 });
  }
  console.error('admin-drive images failed', error);
  return NextResponse.json({ error: 'The image could not be saved to Google Drive.' }, { status: 502 });
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  let input;
  let file = null;
  try {
    if ((request.headers?.get?.('content-type') || '').includes('application/json')) input = await request.json();
    else { const form = await request.formData(); input = Object.fromEntries(form.entries()); file = form.get('file'); }
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const folder = String(input.folder || '');
  if (!ALLOWED.includes(folder)) return NextResponse.json({ error: 'Unknown image folder.' }, { status: 400 });
  const alt = String(input.alt || '').trim().slice(0, 240);
  const subfolder = input.subfolder ? String(input.subfolder) : undefined;
  try {
    const images = await getSiteImages();
    const doc = input.driveFileId
      ? await images.copyPicked({ folder, subfolder, fileId: String(input.driveFileId), alt })
      : await images.store({ folder, subfolder, file: file && typeof file.arrayBuffer === 'function' ? file : null, name: file?.name, alt, ...(UPLOAD_MAX_BYTES[folder] ? { maxBytes: UPLOAD_MAX_BYTES[folder] } : {}) });
    return NextResponse.json({ image: publicSiteImage(doc) }, { status: 201 });
  } catch (error) { return fail(error); }
}

// DELETE ?id=<site image id>: moves the Drive file to the Drive trash and drops the record.
export async function DELETE(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid image.' }, { status: 400 });
  try {
    const images = await getSiteImages({ requireConnected: false });
    const removed = await images.remove(id, { folders: ALLOWED });
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  } catch (error) { return fail(error); }
}
