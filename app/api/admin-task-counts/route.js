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
    let transfersPending = 0;
    let transfersWaitlist = 0;
    let members = 0;

    try {
      const websiteColl = await getCollection(COLLECTIONS.WEBSITE_REQUESTS);
      website = await websiteColl.countDocuments({
        $or: [{ status: 'new' }, { status: null }, { status: { $exists: false } }],
      });
    } catch (e) {
      console.error('task-counts website', e?.message || e);
    }

    try {
      const interestColl = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
      transfersPending = await interestColl.countDocuments({
        $or: [{ status: 'pending' }, { status: null }, { status: { $exists: false } }],
      });
      transfersWaitlist = await interestColl.countDocuments({ status: 'waitlist' });
      transfers = transfersPending + transfersWaitlist;
    } catch {
      transfers = 0;
    }

    try {
      const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
      members = await submissions.countDocuments({});
    } catch {
      members = 0;
    }

    return NextResponse.json(
      {
        website: website || 0,
        transfers: transfers || 0,
        transfersPending: transfersPending || 0,
        transfersWaitlist: transfersWaitlist || 0,
        members: members || 0,
      },
      { headers }
    );
  } catch (error) {
    console.error('admin-task-counts failed', error);
    return NextResponse.json(
      { website: 0, transfers: 0, transfersPending: 0, transfersWaitlist: 0, members: 0 },
      { headers }
    );
  }
}
