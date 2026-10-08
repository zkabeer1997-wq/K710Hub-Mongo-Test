import { ObjectId } from 'mongodb';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { loadCycleFormRows } from './eventCycles.server.js';
import { normalizePrepRowSlots } from './nobleAdvisor.mjs';
import { schedule, rankByDay } from '../app/admin/dashboard/prepScheduler.mjs';
import { schedulerResultToPlacements, lockedForScheduler, unplacedFromAssignments } from './kvkScheduleBridge.mjs';
import { replaceAutoAssignments } from './kvkAppointments.server.js';

// Server side of "Build schedule": reads this cycle's Prep & Appointments answers, ranks them with
// the Prep scheduler (max 1 slot per member per day) and saves the result as automatic
// assignments. Manual (locked) placements are never touched.

/** Prep rows of an appointment cycle id (the event cycle id, or legacy 'current' = current cycle). */
export async function loadPrepRows(cycleId) {
  const eventId = ObjectId.isValid(String(cycleId)) && String(new ObjectId(String(cycleId))) === String(cycleId) ? String(cycleId) : null;
  const loaded = await loadCycleFormRows('prep', eventId);
  if (!loaded) return [];
  return loaded.rows.map(({ _id, pin_hash, ...r }) => normalizePrepRowSlots({ ...r, id: r.id || String(_id) }));
}

/** Rows plus each member's rank per day (1 = best). */
export function withRanks(rows) {
  const ranks = rankByDay(rows);
  return rows.map((r) => {
    const mine = {};
    for (const day of [1, 2, 4]) {
      const i = ranks[day].indexOf(String(r.member_id));
      if (i >= 0) mine[day] = i + 1;
    }
    return { ...r, ranks: mine };
  });
}

/** Build and save. Returns a per-day summary and everyone left without a slot. */
export async function buildAndSaveSchedule(cycleId, now = new Date()) {
  const rows = await loadPrepRows(cycleId);
  const asgColl = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
  const existing = await asgColl.find({ cycle_id: cycleId }).toArray();
  const result = schedule(rows, { locked: lockedForScheduler(existing) });
  const names = new Map(rows.map((r) => [String(r.member_id), r.in_game_name || '']));
  const summary = [];
  for (const { day, buff, placements } of schedulerResultToPlacements(result)) {
    await replaceAutoAssignments(asgColl, { cycle_id: cycleId, day, buff }, placements, names, now);
    const locked = existing.filter((a) => a.day === day && a.buff === buff && a.manual === true).length;
    summary.push({ day, buff, assigned: placements.length, locked });
  }
  const saved = await asgColl.find({ cycle_id: cycleId }).toArray();
  return { summary, rows: rows.length, unplaced: unplacedFromAssignments(rows, saved) };
}
