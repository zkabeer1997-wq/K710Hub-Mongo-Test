import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getCurrentEventCycle, loadCycleFormRows, loadMemberCycleRecord } from './eventCycles.server.js';
import { normalizeNobleSlots, NOBLE_TIME_SLOTS } from './nobleAdvisor.mjs';
import { schedule } from '../app/admin/dashboard/prepScheduler.mjs';
import { replaceAutoAssignments, isCyclePublished } from './kvkAppointments.server.js';
import { schedulerResultToNoblePlacements, lockedForNoble, unplacedNoble, nobleFilter, nobleMyView, nobleGrid } from './nobleAppointment.mjs';

// Server side of the Flamedragon Noble Advisor schedule. Assignments live in
// kvk_appointment_assignments (day 4, buff 'noble', cycle_id = the Flamedragon event cycle id) and the
// published flag in kvk_appointment_cycles, so the existing unique indexes give "one member per slot"
// and "one slot per member" for free. The two event types never share a cycle id.

/** The current Flamedragon cycle ({id,label,start_date,...}) or null. */
export async function currentNobleCycle() {
  return getCurrentEventCycle('flamedragon').catch(() => null);
}

/** Noble answers of a Flamedragon cycle id, slots snapped to the :00/:30 grid, PIN hash removed. */
export async function loadNobleRows(cycleId) {
  const loaded = await loadCycleFormRows('noble', String(cycleId));
  if (!loaded) return [];
  return loaded.rows.map(({ _id, pin_hash, ...r }) => ({ ...r, id: r.id || String(_id), avail_day4: normalizeNobleSlots(r.avail_day4) }));
}

export async function loadNobleAssignments(cycleId) {
  const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
  const rows = await coll.find(nobleFilter(cycleId)).toArray();
  return rows.map((a) => ({ member_id: a.member_id, name: a.name || '', slot: a.slot, manual: a.manual === true }));
}

/** Rank this cycle's Noble answers and save automatic slots (atomic replace). Hand placements are kept. */
export async function buildAndSaveNoble(cycleId, now = new Date()) {
  const rows = await loadNobleRows(cycleId);
  const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
  const existing = await coll.find(nobleFilter(cycleId)).toArray();
  const result = schedule(rows, { day4Slots: NOBLE_TIME_SLOTS, locked: lockedForNoble(existing) });
  const placements = schedulerResultToNoblePlacements(result);
  const names = new Map(rows.map((r) => [String(r.member_id), r.in_game_name || '']));
  await replaceAutoAssignments(coll, nobleFilter(cycleId), placements, names, now);
  const saved = await loadNobleAssignments(cycleId);
  return {
    assigned: placements.length,
    locked: existing.filter((a) => a.manual === true).length,
    answers: rows.length,
    unplaced: unplacedNoble(rows, saved),
  };
}

/** What GET /api/noble-appointment returns for one member. No other member's private data. */
export async function memberNobleAppointment(memberId) {
  const cycle = await currentNobleCycle();
  if (!cycle) return { cycle: null, published: false, publishedAt: null, saved: false, asked: false, status: 'not_asked', mine: null, schedule: null };
  const [loaded, pub] = await Promise.all([loadMemberCycleRecord('noble', memberId), isCyclePublished(String(cycle.id))]);
  const record = loaded.record || null;
  let assignments = [];
  if (pub.published) assignments = await loadNobleAssignments(cycle.id);
  const mineRow = assignments.find((a) => String(a.member_id) === String(memberId)) || null;
  const view = nobleMyView({ record, assignment: mineRow, published: pub.published, cycleStart: cycle.start_date });
  return {
    cycle: { id: String(cycle.id), label: cycle.label || '', start: cycle.start_date || null },
    published: pub.published,
    publishedAt: pub.publishedAt,
    saved: view.saved,
    asked: view.wanted,
    status: view.status,
    mine: mineRow ? { slot: mineRow.slot, range: view.range, dateLabel: view.dateLabel, line: view.line } : null,
    schedule: pub.published ? nobleGrid(assignments, memberId) : null,
  };
}
