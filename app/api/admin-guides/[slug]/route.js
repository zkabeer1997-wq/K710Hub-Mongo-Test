import { guidesTable } from '../../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { SLUG_RE, validateGuide } from '../../../../lib/guideValidation.mjs';

function collectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

const GUIDE_PROJECT = {
  slug: 1, title: 1, category: 1, description: 1, body: 1, position: 1,
  is_published: 1, access_level: 1, created_at: 1, updated_at: 1, _id: 0,
};

export async function DELETE(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  const params = await paramsPromise;
  const slug = params?.slug;
  if (!SLUG_RE.test(slug || '')) {
    return NextResponse.json({ error: 'Invalid guide.' }, { status: 400 });
  }
  try {
    const coll = await getCollection(collectionName());
    const existing = await coll.findOne({ slug }, { projection: { slug: 1 } });
    if (!existing) return NextResponse.json({ error: 'Guide not found.' }, { status: 404 });
    await coll.deleteOne({ slug });
    revalidatePath('/guides');
    revalidatePath(`/guides/${slug}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin guide DELETE failed', error);
    return NextResponse.json({ error: 'Unable to remove guide.' }, { status: 500 });
  }
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
  try {
    const coll = await getCollection(collectionName());
    const now = new Date().toISOString();
    const result = await coll.findOneAndUpdate(
      { slug },
      { $set: { ...guide, updated_at: now } },
      { returnDocument: 'after', projection: GUIDE_PROJECT }
    );
    const data = result?.value || result;
    if (!data || !data.slug) {
      return NextResponse.json({ error: 'Guide not found. Reload the list and try again.' }, { status: 404 });
    }
    revalidatePath('/guides');
    revalidatePath('/guides/[slug]', 'page');
    revalidatePath(`/guides/${slug}`);
    revalidatePath(`/guides/${data.slug}`);
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ guide: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('admin guide PUT failed', error);
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'A guide with that slug already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to save guide.' }, { status: 500 });
  }
}
