import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const order = Array.isArray(body?.order) ? body.order : [];
    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);
    for (let position = 0; position < order.length; position++) {
      const id = order[position];
      const filter =
        ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)
          ? { $or: [{ id: String(id) }, { _id: new ObjectId(id) }] }
          : { id: String(id) };
      await coll.updateOne(filter, { $set: { position, updated_at: new Date().toISOString() } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin-content/reorder' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
