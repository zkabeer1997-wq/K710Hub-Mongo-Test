import { NextResponse } from 'next/server';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { readMemberSession } from '../../../../lib/memberAuth';
import { buildSchedule } from '../../../../lib/kvkAppointments.mjs';
import { getResultPagesVisible } from '../../../../lib/memberFormStatus.server.js';
import { loadAppointmentGate, isCyclePublished } from '../../../../lib/kvkAppointments.server.js';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'private, no-store' };

// GET -> the published schedule (names only). Unpublished schedules are never exposed.
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  try {
    if (!(await getResultPagesVisible()).kvk) return NextResponse.json({ unavailable: true, published: false, days: [] }, { headers: HEADERS });
    const g = await loadAppointmentGate();
    const pub = await isCyclePublished(g.cycleId);
    if (!pub.published) return NextResponse.json({ published: false, days: [] }, { headers: HEADERS });
    const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
    const rows = await coll.find({ cycle_id: g.cycleId }).toArray();
    const mine = String(session.memberId);
    const days = buildSchedule(rows.map((r) => ({ day: r.day, buff: r.buff, slot: r.slot, name: r.name || 'Assigned' })));
    // Flag the viewer's own slots without exposing anyone's member id.
    for (const day of days) {
      for (const s of day.slots) {
        const row = rows.find((r) => r.day === day.day && r.buff === day.buff && r.slot === s.slot);
        s.mine = Boolean(row && String(row.member_id) === mine);
      }
    }
    return NextResponse.json({ published: true, publishedAt: pub.publishedAt, days }, { headers: HEADERS });
  } catch (error) {
    console.error('kvk-appointments schedule failed', error);
    return NextResponse.json({ error: 'Could not load the schedule. Please try again.' }, { status: 500, headers: HEADERS });
  }
}
