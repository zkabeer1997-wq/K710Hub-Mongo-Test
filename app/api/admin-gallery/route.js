import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

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

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, image_url, storage_path, title, caption, alt_text, position, is_published, created_at, updated_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('admin gallery GET failed', error);
    return NextResponse.json({ error: 'Unable to load gallery images.' }, { status: 500 });
  }
  return NextResponse.json({ images: data || [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
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
    return NextResponse.json({ error: 'Image description is required and must be 240 characters or fewer.' }, { status: 400 });
  }
  if (title.length > 120 || caption.length > 500) {
    return NextResponse.json({ error: 'Title or caption is too long.' }, { status: 400 });
  }
  if (!Number.isInteger(position) || position < 0 || position > 100000) {
    return NextResponse.json({ error: 'Position must be a whole number between 0 and 100000.' }, { status: 400 });
  }

  const extension = file.name?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const supabase = createAdminSupabaseClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('kingdom-gallery')
    .upload(storagePath, buffer, { contentType: file.type, cacheControl: '31536000', upsert: false });

  if (uploadError) {
    console.error('gallery storage upload failed', uploadError);
    return NextResponse.json({ error: 'The image could not be uploaded.' }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('kingdom-gallery').getPublicUrl(storagePath);
  const { data, error } = await supabase
    .from('gallery_images')
    .insert({ storage_path: storagePath, image_url: urlData.publicUrl, title, caption, alt_text: altText, position, is_published: isPublished })
    .select('id, image_url, storage_path, title, caption, alt_text, position, is_published, created_at, updated_at')
    .single();

  if (error) {
    await supabase.storage.from('kingdom-gallery').remove([storagePath]);
    console.error('gallery record insert failed', error);
    return NextResponse.json({ error: 'The image uploaded but could not be added to the gallery.' }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/gallery');
  return NextResponse.json({ image: data }, { status: 201 });
}

