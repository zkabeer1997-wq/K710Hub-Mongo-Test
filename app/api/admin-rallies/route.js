import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { currentRallyScope } from '../../../lib/eventCycles.server';
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
    const scope = await currentRallyScope('kvk');
    const coll = await getCollection(COLLECTIONS.ADMIN_RALLIES);
    const data = await coll
      .find(scope.filter)
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
    console.error('admin-rallies' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const rallies = Array.isArray(body.rallies) ? body.rallies : [];
  const rows = serializeRalliesForSave(rallies);

  try {
    // Scoped to the current cycle: earlier cycles' planner rows stay as history.
    const scope = await currentRallyScope('kvk');
    const coll = await getCollection(COLLECTIONS.ADMIN_RALLIES);
    await coll.deleteMany(scope.filter);
    const stamped = scope.cycleId ? rows.map((row) => ({ ...row, event_cycle_id: scope.cycleId })) : rows;
    if (stamped.length > 0) {
      await coll.insertMany(stamped);
    }
    return NextResponse.json({ rallies: formatRallyRows(rows) });
  } catch (error) {
    console.error('admin-rallies' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
