import { readMemberSession } from '../../../../lib/memberAuth';
import { guidesTable, canReadGuide } from '../../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';

export const dynamic = 'force-dynamic';

function validSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9-]{1,80}$/.test(slug);
}

function collectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

const GUIDE_PROJECT = {
  slug: 1, title: 1, category: 1, description: 1, body: 1, position: 1,
  is_published: 1, access_level: 1, updated_at: 1, _id: 0,
};

export async function GET(request, { params: paramsPromise }) {
  const params = await paramsPromise;
  const slug = params?.slug;
  if (!validSlug(slug)) {
    return NextResponse.json({ error: 'Invalid guide.' }, { status: 400 });
  }
  try {
    const admin = await isAdminRequest(request);
    const coll = await getCollection(collectionName());
    const data = await coll.findOne({ slug }, { projection: GUIDE_PROJECT });
    const member = Boolean(await readMemberSession(request));
    if (!canReadGuide(data, { admin, member })) {
      return NextResponse.json(
        { error: data?.is_published && data?.access_level === 'members' ? 'Member login required.' : 'Guide not found.' },
        { status: data?.is_published && data?.access_level === 'members' ? 401 : 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json({ guide: data, isAdmin: admin }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('guide GET failed', error);
    return NextResponse.json({ error: 'Unable to load this guide.' }, { status: 500 });
  }
}

export async function PUT(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  const params = await paramsPromise;
  const slug = params?.slug;
  if (!validSlug(slug)) {
    return NextResponse.json({ error: 'Invalid guide.' }, { status: 400 });
  }
  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const body = payload?.body;
  if (!title) return NextResponse.json({ error: 'Guide title is required.' }, { status: 400 });
  if (title.length > 180) return NextResponse.json({ error: 'Guide title is too long.' }, { status: 413 });
  if (typeof body !== 'string') return NextResponse.json({ error: 'Guide text is required.' }, { status: 400 });
  if (body.length > 120000) return NextResponse.json({ error: 'Guide text is too long.' }, { status: 413 });
  try {
    const coll = await getCollection(collectionName());
    const result = await coll.findOneAndUpdate(
      { slug },
      { $set: { title, body, updated_at: new Date().toISOString() } },
      { returnDocument: 'after', projection: GUIDE_PROJECT }
    );
    const data = result?.value || result;
    if (!data?.slug) return NextResponse.json({ error: 'Guide not found.' }, { status: 404 });
    revalidatePath('/guides');
    revalidatePath(`/guides/${slug}`);
    return NextResponse.json({ guide: data }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('guide PUT failed', error);
    return NextResponse.json({ error: 'Unable to save this guide.' }, { status: 500 });
  }
}
