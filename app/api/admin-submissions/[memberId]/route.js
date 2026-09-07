import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';

export async function DELETE(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = await paramsPromise;
  const memberId = params.memberId;
  if (!memberId) {
    return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
  }
  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const result = await submissions.deleteMany({ member_id: String(memberId) });
    if (!result.deletedCount) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    const profiles = await getCollection(COLLECTIONS.POWER_PROFILES);
    await profiles.deleteMany({ member_id: String(memberId) });
    return NextResponse.json({ deletedMemberIds: [String(memberId)] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
