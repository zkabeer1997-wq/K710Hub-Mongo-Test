import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { requestDisplayName } from '../../../lib/adminInbox.mjs';

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
    // Requests from people who are not on the roster carry their id as the name:
    // fall back to the Kingshot nickname, then to "Member <id>".
    const ids = [...new Set((data || []).map((r) => String(r.member_id || '')).filter(Boolean))];
    const nicknameById = new Map();
    if (ids.length) {
      try {
        const users = await getCollection('kingshot_users');
        const found = await users.find({ player_id: { $in: ids } }).project({ player_id: 1, nickname: 1, _id: 0 }).toArray();
        found.forEach((u) => nicknameById.set(String(u.player_id), u.nickname));
      } catch {
        /* nicknames are a nicety */
      }
    }
    const rows = (data || []).map((row) => {
      const shown = requestDisplayName(row, nicknameById);
      return { ...row, display_name: shown.name, display_name_note: shown.note };
    });
    return NextResponse.json({ rows, configured: true });
  } catch (error) {
    console.error('admin-website-requests failed', error);
    return NextResponse.json({ rows: [], configured: false });
  }
}
