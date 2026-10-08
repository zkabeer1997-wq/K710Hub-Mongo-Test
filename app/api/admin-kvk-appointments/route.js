import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import {
  APPOINTMENT_TYPES, SCHEDULE_TYPES, resolveAppointmentCycle, findType, findScheduleType, allocateSlots, contributionScore, compareApplicants, validateManualAssignment, slotRange,
} from '../../../lib/kvkAppointments.mjs';
import { listEventCycles } from '../../../lib/eventCycles.server.js';
import { loadAppointmentGate, isCyclePublished, iso, replaceAutoAssignments } from '../../../lib/kvkAppointments.server.js';
import { loadPrepRows, withRanks, buildAndSaveSchedule } from '../../../lib/kvkSchedule.server.js';
import { unplacedFromAssignments } from '../../../lib/kvkScheduleBridge.mjs';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'no-store' };
const json = (body, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

// GET -> every application (ranked by contribution), every assignment and the published flag.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return json({ error: 'Unauthorized' }, 401);
  try {
    const g = await loadAppointmentGate();
    const cycles = await listEventCycles('kvk').catch(() => []);
    const picked = resolveAppointmentCycle({
      requested: new URL(request.url).searchParams.get('cycle') || '',
      gateCycleId: g.cycleId,
      cycles,
    });
    const [apps, asg, pub, prepRows] = await Promise.all([
      getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS).then((c) => c.find({ cycle_id: picked.cycleId }).toArray()),
      getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS).then((c) => c.find({ cycle_id: picked.cycleId }).toArray()),
      isCyclePublished(picked.cycleId),
      loadPrepRows(picked.cycleId).catch(() => []),
    ]);
    const applications = apps
      .map((a) => ({
        member_id: a.member_id, in_game_name: a.in_game_name || '', day: a.day, buff: a.buff,
        tg: a.tg, ttg: a.ttg, speedup_days: a.speedup_days, preferred_hours: a.preferred_hours || [],
        score: contributionScore(a), created_at: a.created_at, updated_at: iso(a.updated_at),
      }))
      .sort(compareApplicants)
      .map(({ created_at, ...rest }) => ({ ...rest, created_at: iso(created_at) }));
    const assignments = asg.map((a) => ({
      member_id: a.member_id, name: a.name || '', day: a.day, buff: a.buff, slot: a.slot, manual: a.manual === true,
    }));
    const ranked = withRanks(prepRows).map(({ _id, ...r }) => r);
    return json({
      cycle_id: picked.cycleId, cycle_label: picked.label, is_live: picked.isLive, cycles: picked.options,
      types: SCHEDULE_TYPES, prep_rows: ranked, unplaced: unplacedFromAssignments(prepRows, assignments),
      // Older cycles: applications from the retired separate Appointments form (view only).
      applications, assignments, ...pub,
    });
  } catch (error) {
    console.error('admin-kvk-appointments GET failed', error);
    return json({ error: 'Could not load appointments.' }, 500);
  }
}

/**
 * POST { action }
 *   build_schedule                  rank this cycle's Prep & Appointments answers with the Prep
 *                                   scheduler (max 1 slot per member per day) and save the result
 *                                   as automatic assignments; manual (locked) placements are kept
 *   auto_allocate { day?, buff? }   LEGACY: old separate Appointments applications only
 *   assign        { day, buff, member_id, slot }   manual placement
 *   unassign      { day, buff, member_id }
 *   publish       { published: boolean }
 */
export async function POST(request) {
  if (!(await isAdminRequest(request))) return json({ error: 'Unauthorized' }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  try {
    const g = await loadAppointmentGate();
    const cycle_id = g.cycleId;
    const appsColl = await getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS);
    const asgColl = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);

    if (body?.action === 'publish') {
      const cycles = await getCollection(COLLECTIONS.KVK_APPOINTMENT_CYCLES);
      const published = body.published === true;
      await cycles.updateOne({ cycle_id }, { $set: { published, published_at: published ? new Date() : null, updated_at: new Date() }, $setOnInsert: { cycle_id } }, { upsert: true });
      return json({ ok: true, published });
    }

    if (body?.action === 'build_schedule') {
      const out = await buildAndSaveSchedule(cycle_id);
      return json({ ok: true, ...out });
    }

    if (body?.action === 'auto_allocate') {
      const only = body.day !== undefined || body.buff !== undefined ? findType(body.day, String(body.buff || '')) : null;
      if ((body.day !== undefined || body.buff !== undefined) && !only) return json({ error: 'Choose a valid day and buff.' }, 400);
      const types = only ? [only] : APPOINTMENT_TYPES;
      const summary = [];
      for (const type of types) {
        const filter = { cycle_id, day: type.day, buff: type.buff };
        const [apps, existing] = await Promise.all([appsColl.find(filter).toArray(), asgColl.find(filter).toArray()]);
        // Legacy only: never wipe schedule rows built from Prep answers when there are no old applications.
        if (!apps.length) { summary.push({ day: type.day, buff: type.buff, assigned: 0, locked: existing.filter((a) => a.manual === true).length, unassigned: 0 }); continue; }
        const locked = existing.filter((a) => a.manual === true);
        const result = allocateSlots(apps, locked);
        const names = new Map(apps.map((a) => [String(a.member_id), a.in_game_name || '']));
        await replaceAutoAssignments(asgColl, filter, result.assignments, names);
        summary.push({ day: type.day, buff: type.buff, assigned: result.assignments.length, locked: locked.length, unassigned: result.unassigned.length });
      }
      return json({ ok: true, summary });
    }

    if (body?.action === 'assign') {
      const { value, error } = validateManualAssignment(body);
      if (error) return json({ error }, 400);
      const filter = { cycle_id, day: value.day, buff: value.buff };
      // The Prep & Appointments answers are the source; old applications still count for old cycles.
      const prep = (await loadPrepRows(cycle_id).catch(() => [])).find((r) => String(r.member_id) === value.member_id);
      const app = prep || await appsColl.findOne({ ...filter, member_id: value.member_id });
      if (!app) return json({ error: 'That member has not sent a Prep & Appointments answer this cycle.' }, 404);
      const taken = await asgColl.findOne({ ...filter, slot: value.slot });
      if (taken && String(taken.member_id) !== value.member_id) {
        return json({ error: `${slotRange(value.slot)} is already booked.` }, 409);
      }
      const now = new Date();
      try {
        await asgColl.updateOne(
          { ...filter, member_id: value.member_id },
          { $set: { slot: value.slot, name: app.in_game_name || '', score: prep ? 0 : contributionScore(app), manual: true, updated_at: now }, $setOnInsert: { ...filter, member_id: value.member_id, created_at: now } },
          { upsert: true },
        );
      } catch (err) {
        if (err?.code === 11000) return json({ error: `${slotRange(value.slot)} is already booked.` }, 409);
        throw err;
      }
      return json({ ok: true });
    }

    if (body?.action === 'unassign') {
      const type = findScheduleType(body.day, String(body.buff || ''));
      const memberId = String(body.member_id ?? '').trim();
      if (!type || !memberId) return json({ error: 'Choose a valid day, buff and member.' }, 400);
      await asgColl.deleteOne({ cycle_id, day: type.day, buff: type.buff, member_id: memberId });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('admin-kvk-appointments POST failed', error);
    return json({ error: 'Could not update appointments.' }, 500);
  }
}
