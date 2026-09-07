import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import {
  formatRallyRows,
  serializeRalliesForSave,
} from '../../admin/dashboard/rallyState.mjs';

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_ADMIN_RALLIES);
    const data = await coll
      .find({})
      .project({
        id: 1,
        name: 1,
        position: 1,
        member_ids: 1,
        lead_member_id: 1,
        formation: 1,
        _id: 0,
      })
      .sort({ position: 1 })
      .toArray();
    return NextResponse.json({ rallies: formatRallyRows(data || []) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const rallies = Array.isArray(body.rallies) ? body.rallies : [];
  const rows = serializeRalliesForSave(rallies);

  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_ADMIN_RALLIES);
    await coll.deleteMany({});
    if (rows.length > 0) {
      await coll.insertMany(rows);
    }
    return NextResponse.json({ rallies: formatRallyRows(rows) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
