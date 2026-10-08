import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { validateApplication, validateApplicationBatch, listTypeTitles, APPOINTMENT_TYPES, PREFERRED_HOUR_COUNT } from '../../../lib/kvkAppointments.mjs';
import { loadMemberBase } from '../../../lib/memberPrefill.server.js';
import { ObjectId } from 'mongodb';
import { getCurrentEventCycle } from '../../../lib/eventCycles.server.js';
import { loadAppointmentGate, isCyclePublished, publicApplication } from '../../../lib/kvkAppointments.server.js';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'private, no-store' };

// Newest earlier-cycle application for each day/buff, plus a plain label for the cycle they came from.
async function loadPreviousApplications(memberId, currentCycleId) {
  try {
    const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS);
    const rows = await coll.find({ member_id: memberId, cycle_id: { $ne: currentCycleId } }).toArray();
    rows.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    const seen = new Set();
    const picked = rows.filter((r) => {
      const key = `${r.day}:${r.buff}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let previousLabel = null;
    if (picked.length) {
      const cid = String(picked[0].cycle_id || '');
      if (ObjectId.isValid(cid) && cid.length === 24) {
        const cycles = await getCollection(COLLECTIONS.EVENT_CYCLES);
        const found = await cycles.findOne({ _id: new ObjectId(cid) });
        previousLabel = found?.label || null;
      }
      previousLabel = previousLabel || 'an earlier cycle';
    }
    return { previousApplications: picked.map(publicApplication), previousLabel };
  } catch {
    return { previousApplications: [], previousLabel: null };
  }
}

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
    const cycle = await getCurrentEventCycle('kvk').catch(() => null);
    // Last cycle's answers per day/buff, offered as a starting point (never saved until the member presses Save).
    const { previousApplications, previousLabel } = await loadPreviousApplications(session.memberId, g.cycleId);
    const known = profiles?.name ? null : await loadMemberBase(session.memberId).catch(() => null);
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
      cycleLabel: cycle?.label || null,
      window: { open: g.open, message: g.message, note: g.note },
      published: pub.published,
      publishedAt: pub.publishedAt,
      applications: apps.map(publicApplication),
      assignments,
      defaultName: profiles?.name || known?.name || '',
      previousApplications,
      previousLabel,
    }, { headers: HEADERS });
  } catch (error) {
    console.error('kvk-appointments GET failed', error);
    return NextResponse.json({ error: 'Could not load appointments. Please try again.' }, { status: 500, headers: HEADERS });
  }
}

// Upsert one application on (member_id, day, buff, cycle_id): saving again overwrites.
async function upsertApplication(coll, memberId, cycleId, value, now) {
  const filter = { member_id: memberId, day: value.day, buff: value.buff, cycle_id: cycleId };
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
}

// POST, two body shapes:
//  - one form with every buff: { in_game_name, applications: [{ day, buff, tg, ttg, speedup_days,
//    preferred_hours }], withdraw: [{ day, buff }] }. Validated all-or-nothing, then saved.
//    A withdrawn buff removes the member's application AND any slot leadership gave them for it,
//    so the admin screens never show an assignment without an application.
//  - the older single application: { day, buff, tg, ttg, speedup_days, preferred_hours }.
export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: HEADERS });
  }
  const isBatch = Array.isArray(body?.applications) || Array.isArray(body?.withdraw);
  const checked = isBatch ? validateApplicationBatch(body) : validateApplication(body);
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400, headers: HEADERS });
  try {
    const g = await loadAppointmentGate();
    if (!g.open) return NextResponse.json({ error: g.closedMessage || 'This form is closed.' }, { status: 403, headers: HEADERS });
    const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS);
    const now = new Date();
    if (!isBatch) {
      await upsertApplication(coll, session.memberId, g.cycleId, checked.value, now);
      return NextResponse.json({ ok: true, application: publicApplication({ ...checked.value, updated_at: now }) }, { headers: HEADERS });
    }
    for (const value of checked.applications) await upsertApplication(coll, session.memberId, g.cycleId, value, now);
    if (checked.withdraw.length) {
      const asg = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
      for (const { day, buff } of checked.withdraw) {
        const filter = { member_id: session.memberId, day, buff, cycle_id: g.cycleId };
        await coll.deleteOne(filter);
        await asg.deleteOne(filter);
      }
    }
    const cycle = await getCurrentEventCycle('kvk').catch(() => null);
    return NextResponse.json({
      ok: true,
      cycleLabel: cycle?.label || null,
      applications: checked.applications.map((v) => publicApplication({ ...v, updated_at: now })),
      saved: listTypeTitles(checked.applications),
      withdrawn: listTypeTitles(checked.withdraw),
    }, { headers: HEADERS });
  } catch (err) {
    console.error('kvk-appointments POST failed', err);
    return NextResponse.json({ error: 'Could not save your application. Please try again.' }, { status: 500, headers: HEADERS });
  }
}
