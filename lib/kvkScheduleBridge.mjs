// Bridge between the Prep scheduler (app/admin/dashboard/prepScheduler.mjs, which ranks by the
// Prep & Appointments answers) and the stored appointment assignments
// (kvk_appointment_assignments, keyed by cycle_id + day + buff + slot). Pure, client-safe.
//
// Mapping (one slot per member per day, see MAX_SLOTS_PER_DAY):
//   scheduler Day 1 -> day 1, buff 'construction'   (Chief Minister)
//   scheduler Day 2 -> day 2, buff 'research'       (Chief Minister)
//   scheduler Day 4 -> day 4, buff 'training'       (Noble Advisor)
//   scheduler Day 5 -> day 5, buff 'overflow'       (Chief Minister, leftovers of Day 1 / 2)

import { SCHEDULE_TYPES, SLOT_OPTIONS, findScheduleType, slotRange, typeTitle } from './kvkAppointments.mjs';

export const SCHEDULER_DAY_TO_TYPE = Object.freeze({
  1: SCHEDULE_TYPES.find((t) => t.day === 1),
  2: SCHEDULE_TYPES.find((t) => t.day === 2),
  4: SCHEDULE_TYPES.find((t) => t.day === 4),
  5: SCHEDULE_TYPES.find((t) => t.day === 5),
});

export const OPEN_LABEL = 'Open';

/**
 * Turn a prepScheduler.schedule() result into placements per (day, buff), skipping open
 * spots and locked (manual) slots - those stay exactly as the admin set them.
 * @returns {Array<{ day: number, buff: string, placements: Array<{member_id: string, slot: string}> }>}
 */
export function schedulerResultToPlacements(result) {
  return (result?.days || []).map((d) => {
    const type = SCHEDULER_DAY_TO_TYPE[d.day];
    const placements = (d.rows || [])
      .filter((r) => r.member_id && !r.locked)
      .map((r) => ({ member_id: String(r.member_id), slot: r.time }));
    return { day: type.day, buff: type.buff, placements };
  });
}

/** Group stored assignments into the scheduler's `locked` option: { [day]: [{member_id, slot, name}] }. */
export function lockedForScheduler(assignments) {
  const out = {};
  for (const a of assignments || []) {
    if (a.manual !== true) continue;
    (out[a.day] ||= []).push({ member_id: String(a.member_id), slot: a.slot, name: a.name || '' });
  }
  return out;
}

/** The saved assignments as day tables (same shape the Excel / Drive export uses). */
export function assignmentsToDays(assignments = []) {
  return SCHEDULE_TYPES.map((type) => {
    const bySlot = new Map(assignments.filter((a) => Number(a.day) === type.day && a.buff === type.buff).map((a) => [a.slot, a]));
    return {
      day: type.day,
      buff: type.buff,
      position: `${type.label} (${type.role})`,
      filled: bySlot.size,
      rows: SLOT_OPTIONS.map((s) => ({ time: s.value, range: `${s.utc}–${s.endUtc}`, member: bySlot.get(s.value)?.name || bySlot.get(s.value)?.member_id || '', member_id: bySlot.get(s.value)?.member_id || '' })),
    };
  });
}

/**
 * Plain-text schedule ready to paste into Discord. Only booked slots are listed, by day and
 * time in UTC. `cycleLabel` is optional.
 */
export function scheduleAsText(assignments = [], { cycleLabel = '' } = {}) {
  const lines = [`**KvK appointments${cycleLabel ? ` - ${cycleLabel}` : ''}**`, 'All times are UTC (game time). Convert to your own time zone before the day: your local time is different.', ''];
  let any = false;
  for (const day of assignmentsToDays(assignments)) {
    if (!day.filled) continue;
    any = true;
    const type = findScheduleType(day.day, day.buff);
    lines.push(`**${typeTitle(type)} (${type.role})**`);
    for (const row of day.rows) if (row.member) lines.push(`${row.range} UTC  ${row.member}`);
    lines.push('');
  }
  if (!any) lines.push('No appointments booked yet.');
  return lines.join('\n').trim();
}

/** Sheets for the Excel / Google Drive export: one per day with members, start time in UTC. */
export function scheduleSheets(assignments = []) {
  const days = assignmentsToDays(assignments);
  const sheets = days.map((d) => ({
    name: `Day ${d.day}`,
    aoa: [[`Day ${d.day}`, d.position], ['Start Time (UTC)', 'Member', 'Member ID'], ...d.rows.map((r) => [r.time, r.member || 'Open spot', r.member_id])],
  }));
  return sheets;
}

export { slotRange };

const DAY_WANT = { 1: 'want_construction', 2: 'want_research', 4: 'want_troop_training' };
const DAY_AVAIL = { 1: 'avail_day1', 2: 'avail_day2', 4: 'avail_day4' };
const yes = (v) => ['yes', 'y'].includes(String(v ?? '').trim().toLowerCase());

/**
 * Members who asked for a day but hold no saved slot for it (after Day 5 is taken into account for
 * Days 1 and 2), each with a plain reason. Works on what is SAVED, so manual moves count.
 * @returns {Array<{day:number, member_id:string, name:string, reason:string}>}
 */
export function unplacedFromAssignments(prepRows = [], assignments = []) {
  const taken = new Map(); // day -> Set(slot)
  const placed = new Set(); // `${day}:${member_id}`
  for (const a of assignments) {
    if (!taken.has(Number(a.day))) taken.set(Number(a.day), new Set());
    taken.get(Number(a.day)).add(a.slot);
    placed.add(`${Number(a.day)}:${String(a.member_id)}`);
  }
  const out = [];
  for (const row of prepRows) {
    const id = String(row.member_id || '');
    if (!id) continue;
    for (const day of [1, 2, 4]) {
      if (!yes(row[DAY_WANT[day]])) continue;
      if (placed.has(`${day}:${id}`)) continue;
      if (day !== 4 && placed.has(`5:${id}`)) continue;
      const avail = Array.isArray(row[DAY_AVAIL[day]]) ? row[DAY_AVAIL[day]] : [];
      const free = avail.filter((t) => !taken.get(day)?.has(t));
      const reason = !avail.length
        ? 'Picked no times for this day'
        : free.length
          ? 'Not placed yet: build the schedule or place them by hand'
          : 'No free slot in the times they picked';
      out.push({ day, member_id: id, name: row.in_game_name || '', reason });
    }
  }
  return out;
}
