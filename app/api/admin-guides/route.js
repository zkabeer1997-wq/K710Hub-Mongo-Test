import { guidesTable } from '../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { GUIDE_FIELDS, validateGuide } from '../../../lib/guideValidation.mjs';

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  return null;
}

function collectionName() {
  // guidesTable() may return kingdom_guides or guide_content depending on env
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const coll = await getCollection(collectionName());
    const data = await coll
      .find({})
      .project({
        slug: 1,
        title: 1,
        category: 1,
        description: 1,
        body: 1,
        position: 1,
        is_published: 1,
        access_level: 1,
        created_at: 1,
        updated_at: 1,
        _id: 0,
      })
      .sort({ position: 1, title: 1 })
      .toArray();
    return NextResponse.json(
      { guides: data || [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('admin guides GET failed', error);
    return NextResponse.json({ error: 'Unable to load guides.' }, { status: 500 });
  }
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

  try {
    const coll = await getCollection(collectionName());
    const existing = await coll.findOne({ slug });
    if (existing) {
      return NextResponse.json({ error: 'A guide with that slug already exists.' }, { status: 409 });
    }
    const doc = { ...guide, updated_at: new Date(), created_at: new Date() };
    await coll.insertOne(doc);
    const { _id, ...saved } = doc;
    revalidatePath('/guides');
    revalidatePath(`/guides/${slug}`);
    return NextResponse.json({ guide: saved }, { status: 201 });
  } catch (error) {
    console.error('admin guide POST failed', error);
    return NextResponse.json({ error: 'Unable to create guide.' }, { status: 500 });
  }
}
