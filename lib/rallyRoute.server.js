import { NextResponse } from 'next/server';
import { isAdminRequest } from './adminAuth';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { currentRallyScope } from './eventCycles.server';
import { formatRallyRows, serializeRalliesForSave } from '../app/admin/dashboard/rallyState.mjs';

const PROJECTION = {
  id: 1, name: 1, position: 1, member_ids: 1, lead_member_id: 1, formation: 1,
  manager_name: 1, rally_type: 1, formation_kind: 1, notes: 1, updated_at: 1, _id: 0,
};

/** The saved rallies for an event's current cycle (what GET returns). */
export async function loadSavedRallies(type, collection) {
  const scope = await currentRallyScope(type);
  const coll = await getCollection(COLLECTIONS[collection]);
  const data = await coll.find(scope.filter).project(PROJECTION).sort({ position: 1 }).toArray();
  const savedAt = (data || []).reduce((latest, row) => (row.updated_at > latest ? row.updated_at : latest), '') || null;
  return { rallies: formatRallyRows(data || []), savedAt };
}

/** GET / PUT for one event's saved rallies (current cycle only). Shared by the KvK and Flamedragon routes. */
export function makeRallyHandlers({ type, collection, label }) {
  async function unauthorized(request) {
    if (await isAdminRequest(request)) return null;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fail = (error) => {
    console.error(`${label} failed`, error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  };

  async function GET(request) {
    const denied = await unauthorized(request);
    if (denied) return denied;
    try {
      const { rallies, savedAt } = await loadSavedRallies(type, collection);
      return NextResponse.json({ rallies, saved_at: savedAt });
    } catch (error) {
      return fail(error);
    }
  }

  async function PUT(request) {
    const denied = await unauthorized(request);
    if (denied) return denied;
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const rows = serializeRalliesForSave(Array.isArray(body.rallies) ? body.rallies : []);
    const savedAt = new Date().toISOString();
    try {
      // Scoped to the current cycle: earlier cycles' planner rows stay as history.
      const scope = await currentRallyScope(type);
      const coll = await getCollection(COLLECTIONS[collection]);
      await coll.deleteMany(scope.filter);
      const stamped = rows.map((row) => ({ ...row, updated_at: savedAt, ...(scope.cycleId ? { event_cycle_id: scope.cycleId } : {}) }));
      if (stamped.length > 0) await coll.insertMany(stamped);
      return NextResponse.json({ rallies: formatRallyRows(rows), saved_at: savedAt });
    } catch (error) {
      return fail(error);
    }
  }

  return { GET, PUT };
}
