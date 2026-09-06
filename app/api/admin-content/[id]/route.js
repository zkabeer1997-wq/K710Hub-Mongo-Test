import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';

function idFilter(id) {
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)) {
    return { $or: [{ id: String(id) }, { _id: new ObjectId(id) }] };
  }
  return { id: String(id) };
}

export async function PATCH(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const params = await paramsPromise;
    const body = await request.json();
    const updates = {};
    if (body.content !== undefined) updates.content = body.content;
    if (body.position !== undefined) updates.position = body.position;
    updates.updated_at = new Date().toISOString();

    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);
    const existing = await coll.findOne(idFilter(params.id));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await coll.updateOne({ _id: existing._id }, { $set: updates });
    const data = await coll.findOne({ _id: existing._id });
    const { _id, ...rest } = data;
    return NextResponse.json({ block: { ...rest, id: rest.id || String(_id) } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const params = await paramsPromise;
    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);
    const existing = await coll.findOne(idFilter(params.id));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await coll.deleteOne({ _id: existing._id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
