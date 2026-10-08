import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { validateApplication, APPOINTMENT_TYPES, PREFERRED_HOUR_COUNT } from '../../../lib/kvkAppointments.mjs';
import { loadAppointmentGate, isCyclePublished, publicApplication } from '../../../lib/kvkAppointments.server.js';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'private, no-store' };

// GET -> this member's applications, and their assignments once published.
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  try {
    const g = await loadAppointmentGate();
    const [apps, pub, profiles] = await Promise.all([
      getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS).then((c) => c.find({ member_id: session.memberId, cycle_id: g.cycleId }).toArray()),
      isCyclePublished(g.cycleId),
      getCollection(COLLECTIONS.POWER_PROFILES).then((c) => c.findOne({ member_id: session.memberId }, { projection: { name: 1, _id: 0 } })),
    ]);
    let assignments = [];
    if (pub.published) {
      const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
      const rows = await coll.find({ member_id: session.memberId, cycle_id: g.cycleId }).toArray();
      assignments = rows.map((r) => ({ day: r.day, buff: r.buff, slot: r.slot }));
    }
    return NextResponse.json({
      types: APPOINTMENT_TYPES,
      preferredHourCount: PREFERRED_HOUR_COUNT,
      cycle_id: g.cycleId,
      window: { open: g.open, message: g.message, note: g.note },
      published: pub.published,
      publishedAt: pub.publishedAt,
      applications: apps.map(publicApplication),
      assignments,
      defaultName: profiles?.name || '',
    }, { headers: HEADERS });
  } catch (error) {
    console.error('kvk-appointments GET failed', error);
    return NextResponse.json({ error: 'Could not load appointments. Please try again.' }, { status: 500, headers: HEADERS });
  }
}

// POST { day, buff, tg, ttg, speedup_days, preferred_hours: [3 UTC hours] }
// Upserts on (member_id, day, buff, cycle_id): saving again overwrites.
export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: HEADERS });
  }
  const { value, error } = validateApplication(body);
  if (error) return NextResponse.json({ error }, { status: 400, headers: HEADERS });
  try {
    const g = await loadAppointmentGate();
    if (!g.open) return NextResponse.json({ error: g.note || g.message || 'Appointments are closed.' }, { status: 403, headers: HEADERS });
    const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS);
    const filter = { member_id: session.memberId, day: value.day, buff: value.buff, cycle_id: g.cycleId };
    const now = new Date();
    // day/buff/member_id/cycle_id come from the filter on insert; setting them in
    // $set or $setOnInsert as well makes MongoDB reject the update with a path conflict.
    const { day: _day, buff: _buff, ...fields } = value;
    const update = { $set: { ...fields, updated_at: now }, $setOnInsert: { created_at: now } };
    try {
      await coll.updateOne(filter, update, { upsert: true });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      await coll.updateOne(filter, update, { upsert: true });
    }
    return NextResponse.json({ ok: true, application: publicApplication({ ...value, updated_at: now }) }, { headers: HEADERS });
  } catch (err) {
    console.error('kvk-appointments POST failed', err);
    return NextResponse.json({ error: 'Could not save your application. Please try again.' }, { status: 500, headers: HEADERS });
  }
}
