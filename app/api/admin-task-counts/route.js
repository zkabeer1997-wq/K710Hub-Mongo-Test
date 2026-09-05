import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  try {
    let website = 0;
    let transfers = 0;

    try {
      const websiteColl = await getCollection(COLLECTIONS.WEBSITE_REQUESTS);
      website = await websiteColl.countDocuments({
        $or: [{ status: 'new' }, { status: null }, { status: { $exists: false } }],
      });
    } catch (e) {
      console.error('task-counts website', e?.message || e);
    }

    try {
      const interestColl = await getCollection('interest_submissions');
      transfers = await interestColl.countDocuments({
        $or: [
          { status: { $in: ['pending', 'waitlist'] } },
          { status: null },
          { status: { $exists: false } },
        ],
      });
    } catch {
      // collection may not exist yet — treat as 0
      transfers = 0;
    }

    return NextResponse.json({ website: website || 0, transfers: transfers || 0 }, { headers });
  } catch (error) {
    console.error('admin-task-counts failed', error);
    // Never 503 the admin shell — return zeros instead
    return NextResponse.json({ website: 0, transfers: 0 }, { headers });
  }
}
