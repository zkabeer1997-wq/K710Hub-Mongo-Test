import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { getSiteImages, SiteImageError } from '../../../lib/siteImages.server';
import { GUIDE_IMAGE_MAX_BYTES, guideAttachmentFromSiteImage } from '../../../lib/guideImageStore.mjs';
import { SITE_IMAGE_TYPES } from '../../../lib/siteImages.mjs';

const GUIDE_RE = /^[a-z0-9-]{1,80}$/;

// POST multipart { file, guide } (upload from this computer) or JSON
// { driveFileId, guide } (picked in Google Drive; copied into the folder).
// Images are stored in Drive "K710 Website/Guides images"; Mongo keeps
// metadata only. Builder guides reference /api/guide-images/<path>.
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  let input; let file = null;
  try {
    if ((request.headers?.get?.('content-type') || '').includes('application/json')) input = await request.json();
    else { const form = await request.formData(); input = { guide: form.get('guide') }; file = form.get('file'); }
  } catch {
    return NextResponse.json({ error: 'Invalid image upload.' }, { status: 400 });
  }
  const guide = typeof input.guide === 'string' && GUIDE_RE.test(input.guide) ? input.guide : '';
  if (!input.driveFileId) {
    if (!file || typeof file.arrayBuffer !== 'function' || !SITE_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Choose a JPG, PNG, WebP, or GIF image.' }, { status: 415 });
    }
    if (!file.size || file.size > GUIDE_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: 'Photos must be between 1 byte and 3 MB.' }, { status: 413 });
    }
  }
  let images; let record;
  try {
    images = await getSiteImages();
    record = input.driveFileId
      ? await images.copyPicked({ folder: 'guide', fileId: String(input.driveFileId), maxBytes: GUIDE_IMAGE_MAX_BYTES })
      : await images.store({ folder: 'guide', file, name: file.name, maxBytes: GUIDE_IMAGE_MAX_BYTES });
  } catch (error) {
    if (error instanceof SiteImageError || error?.name === 'FolderNameError') {
      return NextResponse.json({ error: error.message, ...(error.needsConnect ? { needsConnect: true } : {}) }, { status: error.status || 400 });
    }
    console.error('Guide photo Drive upload failed', error);
    return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 502 });
  }
  try {
    const coll = await getCollection('guide_attachments');
    const row = guideAttachmentFromSiteImage(record, { guide });
    await coll.insertOne(row);
    const src = `/api/guide-images/${row.path}`;
    return NextResponse.json({ url: src, src, path: row.path }, { status: 201 });
  } catch (error) {
    console.error('Guide photo upload failed', error);
    try { await images.remove(String(record._id)); } catch { /* orphan stays in Drive */ }
    return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 500 });
  }
}

// Thumbnail library for one guide (page builder).
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  const guide = new URL(request.url).searchParams.get('guide') || '';
  if (!GUIDE_RE.test(guide)) return NextResponse.json({ images: [] });
  try {
    const coll = await getCollection('guide_attachments');
    const rows = await coll.find({ guide }).project({ path: 1, created_at: 1, _id: 0 }).sort({ created_at: -1 }).limit(200).toArray();
    return NextResponse.json({ images: rows.map(r => ({ src: `/api/guide-images/${r.path}`, created_at: r.created_at })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Guide image library failed', error);
    return NextResponse.json({ images: [] });
  }
}
