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
    const websiteColl = await getCollection(COLLECTIONS.WEBSITE_REQUESTS);
    // interest_submissions may not exist in the export — treat missing as 0
    let transfers = 0;
    try {
      const interestColl = await getCollection('interest_submissions');
      transfers = await interestColl.countDocuments({
        $or: [{ status: { $in: ['pending', 'waitlist'] } }, { status: null }, { status: { $exists: false } }],
      });
    } catch {
      transfers = 0;
    }

    const website = await websiteColl.countDocuments({
      $or: [{ status: 'new' }, { status: null }, { status: { $exists: false } }],
    });

    return NextResponse.json({ website: website || 0, transfers: transfers || 0 }, { headers });
  } catch {
    return NextResponse.json({ error: 'Task counts unavailable.' }, { status: 503, headers });
  }
}
