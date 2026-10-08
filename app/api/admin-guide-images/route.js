import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { bytesMatchImageType } from '../../../lib/interestUploadLimits.mjs';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid image upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || !TYPES[file.type]) {
    return NextResponse.json({ error: 'Choose a JPG, PNG, WebP, or GIF image.' }, { status: 415 });
  }
  if (!file.size || file.size > 3 * 1024 * 1024) {
    return NextResponse.json({ error: 'Photos must be between 1 byte and 3 MB.' }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = bytesMatchImageType(bytes, file.type);
  if (!valid) {
    return NextResponse.json(
      { error: 'This file is not a valid image of the selected type.' },
      { status: 415 }
    );
  }

  // Stored in Mongo; builder guides reference it through /api/guide-images/<path>.
  const guide = typeof form.get('guide') === 'string' && /^[a-z0-9-]{1,80}$/.test(form.get('guide')) ? form.get('guide') : '';
  const compact = form.get('compact') === '1';
  const dataUrl = `data:${file.type};base64,${bytes.toString('base64')}`;
  const path = `${randomUUID()}.${TYPES[file.type]}`;
  try {
    const coll = await getCollection('guide_attachments');
    await coll.insertOne({
      path,
      content_type: file.type,
      data_url: dataUrl,
      guide,
      created_at: new Date(),
    });
    const src = `/api/guide-images/${path}`;
    // Compact responses (page builder) skip echoing the whole image back.
    return NextResponse.json({ url: compact ? src : dataUrl, src, path }, { status: 201 });
  } catch (error) {
    console.error('Guide photo upload failed', error);
    return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 500 });
  }
}

// Thumbnail library for one guide (page builder).
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  const guide = new URL(request.url).searchParams.get('guide') || '';
  if (!/^[a-z0-9-]{1,80}$/.test(guide)) return NextResponse.json({ images: [] });
  try {
    const coll = await getCollection('guide_attachments');
    const rows = await coll.find({ guide }).project({ path: 1, created_at: 1, _id: 0 }).sort({ created_at: -1 }).limit(200).toArray();
    return NextResponse.json({ images: rows.map(r => ({ src: `/api/guide-images/${r.path}`, created_at: r.created_at })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Guide image library failed', error);
    return NextResponse.json({ images: [] });
  }
}
