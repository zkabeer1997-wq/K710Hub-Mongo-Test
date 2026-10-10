import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { releaseLoreImage, validateLoreInput } from '../../../../lib/lore.mjs';
import { removeLorePhoto, resolveLoreImage } from '../../../../lib/lore.server';

export const dynamic = 'force-dynamic';

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

const SERVER_ERROR = 'Something went wrong. Please try again.';

async function readNumber(paramsPromise) {
  const raw = (await paramsPromise)?.number;
  const n = /^\d{1,4}$/.test(String(raw ?? '')) ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function PUT(request, { params }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const current = await readNumber(params);
  if (!current) return NextResponse.json({ error: 'Invalid story number.' }, { status: 400 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const { value, error } = validateLoreInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const coll = await getCollection(COLLECTIONS.LORE_STORIES);
    const before = await coll.findOne({ number: current });
    if (!before) return NextResponse.json({ error: 'Story not found.' }, { status: 404 });
    if (value.number !== current && await coll.findOne({ number: value.number }, { projection: { _id: 1 } })) {
      return NextResponse.json({ error: `Story ${value.number} already exists. Pick another number.` }, { status: 409 });
    }
    // Omitting image_id leaves the photo alone; sending '' clears it.
    const image = await resolveLoreImage(value);
    if (image.error) return NextResponse.json({ error: image.error }, { status: 400 });
    const update = { ...image.fields, updated_at: new Date() };
    await coll.updateOne({ _id: before._id }, { $set: update });
    if (update.image_id !== undefined && before.image_id && before.image_id !== update.image_id) {
      await releaseLoreImage({ stories: coll, imageId: before.image_id, removeImage: removeLorePhoto });
    }
    const { _id, ...story } = { ...before, ...update };
    return NextResponse.json({ story, ...(image.warning ? { warning: image.warning } : {}) });
  } catch (err) {
    if (err?.code === 11000) return NextResponse.json({ error: `Story ${value.number} already exists. Pick another number.` }, { status: 409 });
    console.error('admin-lore/[number] failed', err);
    return NextResponse.json({ error: SERVER_ERROR }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const number = await readNumber(params);
  if (!number) return NextResponse.json({ error: 'Invalid story number.' }, { status: 400 });
  try {
    const coll = await getCollection(COLLECTIONS.LORE_STORIES);
    const existing = await coll.findOne({ number }, { projection: { image_id: 1 } });
    const result = await coll.deleteOne({ number });
    if (!result.deletedCount) return NextResponse.json({ error: 'Story not found.' }, { status: 404 });
    if (existing?.image_id) await releaseLoreImage({ stories: coll, imageId: existing.image_id, removeImage: removeLorePhoto });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin-lore/[number] failed', error);
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  }
}
