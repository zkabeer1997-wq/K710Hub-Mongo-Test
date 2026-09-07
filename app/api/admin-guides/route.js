import { guidesTable } from '../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

import { GUIDE_FIELDS, validateGuide } from '../../../lib/guideValidation.mjs';

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
    .from(guidesTable())
    .select('slug, title, category, description, body, position, is_published, access_level, created_at, updated_at')
    .order('position', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    console.error('admin guides GET failed', error);
    return NextResponse.json({ error: 'Unable to load guides.' }, { status: 500 });
  }

  return NextResponse.json(
    { guides: data || [] },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

export async function POST(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { guide, error: validationError } = validateGuide(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const { slug } = guide;

  const now = new Date().toISOString();
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from(guidesTable())
    .insert({ ...guide, updated_at: now })
    .select(GUIDE_FIELDS)
    .single();

  if (error) {
    console.error('admin guide POST failed', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A guide with that slug already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to create guide.' }, { status: 500 });
  }

  revalidatePath('/guides');
  revalidatePath(`/guides/${slug}`);

  return NextResponse.json({ guide: data }, { status: 201 });
}
