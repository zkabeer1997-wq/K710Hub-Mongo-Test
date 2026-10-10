import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { nextStoryNumber, sortStories, validateLoreInput } from '../../../lib/lore.mjs';
import { resolveLoreImage } from '../../../lib/lore.server';

export const dynamic = 'force-dynamic';

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

const SERVER_ERROR = 'Something went wrong. Please try again.';

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const coll = await getCollection(COLLECTIONS.LORE_STORIES);
    const docs = await coll.find({}).toArray();
    const stories = sortStories(docs).map(({ _id, ...rest }) => rest);
    return NextResponse.json({ stories, next_number: nextStoryNumber(stories) });
  } catch (error) {
    console.error('admin-lore failed', error);
    return NextResponse.json({ error: SERVER_ERROR }, { status: 500 });
  }
}

export async function POST(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const { value, error } = validateLoreInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const coll = await getCollection(COLLECTIONS.LORE_STORIES);
    if (await coll.findOne({ number: value.number }, { projection: { _id: 1 } })) {
      return NextResponse.json({ error: `Story ${value.number} already exists. Pick another number or edit that story.` }, { status: 409 });
    }
    const image = await resolveLoreImage(value);
    if (image.error) return NextResponse.json({ error: image.error }, { status: 400 });
    const now = new Date();
    const doc = { ...image.fields, created_at: now, updated_at: now };
    await coll.insertOne(doc);
    const { _id, ...story } = doc;
    return NextResponse.json({ story, ...(image.warning ? { warning: image.warning } : {}) });
  } catch (err) {
    if (err?.code === 11000) return NextResponse.json({ error: `Story ${value.number} already exists. Pick another number or edit that story.` }, { status: 409 });
    console.error('admin-lore failed', err);
    return NextResponse.json({ error: SERVER_ERROR }, { status: 500 });
  }
}
