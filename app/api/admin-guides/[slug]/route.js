import { guidesTable } from '../../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';

import { GUIDE_FIELDS, SLUG_RE, validateGuide } from '../../../../lib/guideValidation.mjs';

export async function DELETE(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }

  const params = await paramsPromise;
  const slug = params?.slug;
  if (!SLUG_RE.test(slug || '')) {
    return NextResponse.json({ error: 'Invalid guide.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from(guidesTable())
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (fetchError) {
    console.error('admin guide lookup failed', fetchError);
    return NextResponse.json({ error: 'Unable to remove guide.' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Guide not found.' }, { status: 404 });
  }

  const { error } = await supabase.from(guidesTable()).delete().eq('slug', slug);
  if (error) {
    console.error('admin guide DELETE failed', error);
    return NextResponse.json({ error: 'Unable to remove guide.' }, { status: 500 });
  }

  revalidatePath('/guides');
  revalidatePath(`/guides/${slug}`);

  return NextResponse.json({ ok: true });
}

export async function PUT(request, { params }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  const { slug } = await params;
  if (!SLUG_RE.test(slug || '')) return NextResponse.json({ error: 'Invalid guide.' }, { status: 400 });
  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const { guide, error: validationError } = validateGuide(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from(guidesTable())
    .update({ ...guide, updated_at: new Date().toISOString() })
    .eq('slug', slug).select(GUIDE_FIELDS).maybeSingle();
  if (error) {
    console.error('admin guide PUT failed', error);
    return NextResponse.json({ error: error.code === '23505' ? 'A guide with that slug already exists.' : 'Unable to save guide.' }, { status: error.code === '23505' ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: 'Guide not found. Reload the list and try again.' }, { status: 404 });
  revalidatePath('/guides');
  revalidatePath('/guides/[slug]', 'page');
  revalidatePath(`/guides/${slug}`);
  revalidatePath(`/guides/${data.slug}`);
  revalidatePath('/sitemap.xml');
  return NextResponse.json({ guide: data }, { headers: { 'Cache-Control': 'no-store' } });
}
