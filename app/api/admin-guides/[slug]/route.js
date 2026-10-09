import { guidesTable } from '../../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { SLUG_RE, validateGuide } from '../../../../lib/guideValidation.mjs';
import { guideImageExists, releaseGuideImage } from '../../../../lib/guideImages.mjs';

// Removes the Drive file + record of a no-longer-used guide picture (best effort).
async function removeGuidePicture(id) {
  const { getSiteImages } = await import('../../../../lib/siteImages.server');
  return (await getSiteImages({ requireConnected: false })).remove(id, { folders: ['guide'] });
}

function collectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

const GUIDE_PROJECT = {
  slug: 1, title: 1, category: 1, description: 1, body: 1, layout: 1,
  f2p_content: 1, spender_content: 1, position: 1,
  is_published: 1, access_level: 1, reviewed_by: 1, image_id: 1, created_at: 1, updated_at: 1, _id: 0,
};

export async function GET(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  const { slug } = await paramsPromise;
  if (!SLUG_RE.test(slug || '')) return NextResponse.json({ error: 'Invalid guide.' }, { status: 400 });
  try {
    const coll = await getCollection(collectionName());
    const guide = await coll.findOne({ slug }, { projection: { ...GUIDE_PROJECT, draft: 1 } });
    if (!guide) return NextResponse.json({ error: 'Guide not found.' }, { status: 404 });
    return NextResponse.json({ guide }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('admin guide GET failed', error);
    return NextResponse.json({ error: 'Unable to load guide.' }, { status: 500 });
  }
}

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
    const existing = await coll.findOne({ slug }, { projection: { slug: 1, image_id: 1, 'draft.image_id': 1 } });
    if (!existing) return NextResponse.json({ error: 'Guide not found.' }, { status: 404 });
    await coll.deleteOne({ slug });
    for (const id of new Set([existing.image_id, existing.draft?.image_id])) await releaseGuideImage({ guides: coll, imageId: id, removeImage: removeGuidePicture });
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
    const before = await coll.findOne({ slug }, { projection: { image_id: 1, 'draft.image_id': 1 } });
    // A picture that no longer exists is dropped (and reported) instead of blocking the guide text.
    let imageDropped = false;
    if (guide.image_id && !(await guideImageExists(await getCollection(COLLECTIONS.SITE_IMAGES), guide.image_id))) { guide.image_id = ''; imageDropped = true; }
    const result = await coll.findOneAndUpdate(
      { slug },
      { $set: { ...guide, updated_at: now }, $unset: { draft: '' } },
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
    if (before) {
      for (const id of new Set([before.image_id, before.draft?.image_id])) if (id && id !== data.image_id) await releaseGuideImage({ guides: coll, imageId: id, removeImage: removeGuidePicture });
    }
    return NextResponse.json({ guide: data, ...(imageDropped ? { warning: 'The guide picture was no longer available, so the guide was saved without it.' } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('admin guide PUT failed', error);
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'A guide with that slug already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to save guide.' }, { status: 500 });
  }
}
