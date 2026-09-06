import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';

const STATUSES = ['new', 'in_progress', 'done', 'rejected'];

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
  const params = await paramsPromise;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const status = String(body?.status || '');
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.WEBSITE_REQUESTS);
    const existing = await coll.findOne(idFilter(id));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await coll.updateOne({ _id: existing._id }, { $set: { status, updated_at: new Date().toISOString() } });
    const data = await coll.findOne(
      { _id: existing._id },
      {
        projection: {
          id: 1, member_id: 1, name: 1, current_alliance: 1, section: 1,
          message: 1, status: 1, created_at: 1, _id: 1,
        },
      }
    );
    const { _id, ...rest } = data;
    return NextResponse.json({ row: { ...rest, id: rest.id || String(_id) } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
