import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  let form;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid image upload.' }, { status: 400 }); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || !TYPES[file.type]) return NextResponse.json({ error: 'Choose a JPG, PNG, WebP, or GIF image.' }, { status: 415 });
  if (!file.size || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: 'Photos must be between 1 byte and 3 MB.' }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = (file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (file.type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (file.type === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    || (file.type === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)));
  if (!valid) return NextResponse.json({ error: 'This file is not a valid image of the selected type.' }, { status: 415 });
  const path = `${crypto.randomUUID()}.${TYPES[file.type]}`;
  const bucket = createAdminSupabaseClient().storage.from('guide-attachments');
  const { error } = await bucket.upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) {
    console.error('Guide photo upload failed', error);
    return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ url: `/api/guide-images/${path}` }, { status: 201 });
}
