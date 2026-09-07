import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.WEBSITE_REQUESTS);
    const data = await coll
      .find({})
      .project({
        id: 1,
        member_id: 1,
        name: 1,
        current_alliance: 1,
        section: 1,
        message: 1,
        status: 1,
        created_at: 1,
        _id: 0,
      })
      .sort({ created_at: -1 })
      .toArray();
    return NextResponse.json({ rows: data || [], configured: true });
  } catch (error) {
    console.error('admin-website-requests failed', error);
    return NextResponse.json({ rows: [], configured: false });
  }
}
