import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { validateNobleAdvisor, normalizeNobleSlots } from '../../../lib/nobleAdvisor.mjs';
import { checkFormOpen } from '../../../lib/formGates.server.js';
import { loadMemberBase } from '../../../lib/memberPrefill.server.js';
import { getCurrentEventCycle, loadMemberCycleRecord } from '../../../lib/eventCycles.server.js';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401, headers });
  try {
    const profiles = await getCollection(COLLECTIONS.POWER_PROFILES);
    const [loaded, profile] = await Promise.all([
      loadMemberCycleRecord('noble', session.memberId),
      profiles.findOne({ member_id: session.memberId }, { projection: { name: 1 } }),
    ]);
    const { cycle } = loaded;
    // Legacy quarter-hour times (:15/:45) are snapped to the earlier :00/:30 so nothing is dropped.
    const snap = (r) => (r ? { ...r, avail_day4: normalizeNobleSlots(r.avail_day4) } : r);
    const record = snap(loaded.record);
    const previous = snap(loaded.previous);
    return NextResponse.json(
      { record, previous, cycle, member_id: session.memberId, profile_name: profile?.name || '' },
      { headers }
    );
  } catch {
    return NextResponse.json({ error: 'Unable to load your booking.' }, { status: 500, headers });
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401, headers });
  try {
    const gateCheck = await checkFormOpen('noble');
    if (!gateCheck.open) {
      return NextResponse.json({ error: gateCheck.error }, { status: 403, headers });
    }
  } catch {
    return NextResponse.json({ error: 'Unable to save your booking. Please try again.' }, { status: 500, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid booking.' }, { status: 400, headers });
  }
  const { record, error } = validateNobleAdvisor(body);
  if (error) return NextResponse.json({ error }, { status: 400, headers });
  try {
    const cycle = await getCurrentEventCycle('flamedragon');
    if (!cycle) return NextResponse.json({ error: 'There is no active Flamedragon cycle yet.' }, { status: 409, headers });
    const coll = await getCollection(COLLECTIONS.NOBLE_ADVISOR);
    await coll.updateOne(
      { member_id: session.memberId, event_cycle_id: cycle.id },
      {
        $set: {
          ...record,
          member_id: session.memberId,
          event_cycle_id: cycle.id,
          event_cycle_label: cycle.label,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, cycle: { id: cycle.id, label: cycle.label } }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to save your booking.' }, { status: 500, headers });
  }
}
