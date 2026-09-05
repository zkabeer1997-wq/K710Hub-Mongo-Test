import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });

  try {
    const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
    const data = await coll.findOne(
      { member_id: session.memberId },
      { projection: { member_id: 1, charms: 1, updated_at: 1, _id: 0 } }
    );
    return NextResponse.json({ profile: data || null });
  } catch (error) {
    console.error('member-charm-profile GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved charm levels.' }, { status: 500 });
  }
}
