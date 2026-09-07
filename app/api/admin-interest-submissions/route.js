import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    const data = await coll.find({}).sort({ created_at: -1 }).toArray();
    return NextResponse.json({
      rows: (data || []).map(({ _id, ...r }) => ({ ...r, id: r.id || String(_id) })),
    });
  } catch (error) {
    // Collection may not exist in the one-time export
    return NextResponse.json({ rows: [] });
  }
}
