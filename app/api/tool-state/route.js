import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { SUPPORTED_TOOL_KEYS } from '../../../lib/toolKeys.mjs';

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
  try {
    const coll = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
    const plans = await coll
      .find({ member_id: session.memberId, tool_key: { $in: SUPPORTED_TOOL_KEYS } })
      .project({ tool_key: 1, updated_at: 1, _id: 0 })
      .sort({ updated_at: -1 })
      .toArray();
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('tool-state list GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved plans.' }, { status: 500 });
  }
}
