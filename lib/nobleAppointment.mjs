// Flamedragon Tyrant Noble Advisor appointments (pure, client-safe).
// One slot per member on the 30-minute UTC grid. Stored like the KvK assignments:
// kvk_appointment_assignments {cycle_id: <Flamedragon event cycle id>, day: 4, buff: 'noble', slot, member_id, name, manual}
// and the published flag in kvk_appointment_cycles {cycle_id: <same id>, published}.
import { SLOT_OPTIONS, slotRange } from './kvkAppointments.mjs';
import { prepDayDate, shortUtcDate } from './myAppointment.mjs';

export const NOBLE_DAY = 4;
export const NOBLE_BUFF = 'noble';
export const NOBLE_TYPE = Object.freeze({ day: NOBLE_DAY, buff: NOBLE_BUFF, label: 'Noble Advisor', role: 'Noble Advisor' });
export const NOBLE_MY_HREF = '/forms/flamedragon-tyrant/my-appointment';
export const NOBLE_FORM_HREF = '/forms/flamedragon-tyrant/noble-advisor';

const yes = (v) => ['yes', 'y'].includes(String(v ?? '').trim().toLowerCase());

/** The single stored (day, buff) of the Noble schedule, for filters. */
export const nobleFilter = (cycleId) => ({ cycle_id: String(cycleId), day: NOBLE_DAY, buff: NOBLE_BUFF });

/**
 * prepScheduler.schedule() result -> automatic placements for the Noble schedule.
 * Open spots and locked (hand-placed) slots are skipped: those rows stay exactly as set.
 * Never more than one slot per member.
 */
export function schedulerResultToNoblePlacements(result) {
  const day = (result?.days || []).find((d) => d.day === NOBLE_DAY);
  const seen = new Set();
  const placements = [];
  for (const r of day?.rows || []) {
    if (!r.member_id || r.locked) continue;
    const id = String(r.member_id);
    if (seen.has(id)) continue;
    seen.add(id);
    placements.push({ member_id: id, slot: r.time });
  }
  return placements;
}

/** Stored assignments -> the scheduler's `locked` option ({4: [...]}) from hand placements only. */
export function lockedForNoble(assignments = []) {
  const list = assignments
    .filter((a) => a.manual === true && Number(a.day) === NOBLE_DAY && a.buff === NOBLE_BUFF)
    .map((a) => ({ member_id: String(a.member_id), slot: a.slot, name: a.name || '' }));
  return list.length ? { [NOBLE_DAY]: list } : {};
}

/** Members who said Yes to a Noble Advisor time but hold no saved slot, with a plain reason. */
export function unplacedNoble(rows = [], assignments = []) {
  const placed = new Set(assignments.map((a) => String(a.member_id)));
  const taken = new Set(assignments.map((a) => a.slot));
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.member_id || '');
    if (!id || seen.has(id) || !yes(row.want_troop_training) || placed.has(id)) continue;
    seen.add(id);
    const avail = Array.isArray(row.avail_day4) ? row.avail_day4 : [];
    const free = avail.filter((t) => !taken.has(t));
    out.push({
      member_id: id,
      name: row.in_game_name || '',
      reason: !avail.length ? 'Picked no times' : free.length ? 'Not placed yet: build the schedule or place them by hand' : 'No free slot in the times they picked',
    });
  }
  return out;
}

/** "Oct 18, 14:30 UTC" (date omitted without a cycle start date). */
export function nobleLine({ slot }, cycleStart) {
  const date = shortUtcDate(prepDayDate(cycleStart, 1));
  return `${date ? `${date}, ` : ''}${slot} UTC`;
}

/**
 * What the member sees.
 *  placed     - published and a slot is saved
 *  not_placed - published, they asked for a time, no slot
 *  waiting    - not published yet and they asked for a time
 *  not_asked  - no answer saved, or they said No
 */
export function nobleMyView({ record = null, assignment = null, published = false, cycleStart = null } = {}) {
  const wanted = yes(record?.want_troop_training);
  const asg = published ? assignment : null;
  let status = 'not_asked';
  if (asg) status = 'placed';
  else if (wanted) status = published ? 'not_placed' : 'waiting';
  return {
    status,
    wanted,
    saved: Boolean(record),
    slot: asg ? asg.slot : null,
    range: asg ? slotRange(asg.slot) : null,
    dateLabel: shortUtcDate(prepDayDate(cycleStart, 1)),
    line: asg ? nobleLine(asg, cycleStart) : '',
  };
}

/** All 48 slots for the published grid: {slot, range, name|null, mine}. Names only, never ids. */
export function nobleGrid(assignments = [], viewerId = '') {
  const bySlot = new Map(assignments.map((a) => [a.slot, a]));
  return SLOT_OPTIONS.map((s) => {
    const a = bySlot.get(s.value);
    return { slot: s.value, range: `${s.utc}–${s.endUtc}`, name: a ? a.name || 'Assigned' : null, mine: Boolean(a && String(a.member_id) === String(viewerId)) };
  });
}

/** Discord text: booked slots only, UTC. */
export function nobleScheduleAsText(assignments = [], { cycleLabel = '' } = {}) {
  const lines = [`**Flamedragon Tyrant - Noble Advisor${cycleLabel ? ` - ${cycleLabel}` : ''}**`, 'All times are UTC (game time). Convert to your own time zone before the day: your local time is different.', ''];
  const booked = SLOT_OPTIONS
    .map((s) => ({ s, a: assignments.find((x) => x.slot === s.value) }))
    .filter((x) => x.a);
  if (!booked.length) lines.push('No appointments booked yet.');
  for (const { s, a } of booked) lines.push(`${s.utc}–${s.endUtc} UTC  ${a.name || a.member_id}`);
  return lines.join('\n').trim();
}

/** Excel / Google Drive sheets: one sheet, every half hour. */
export function nobleScheduleSheets(assignments = []) {
  const bySlot = new Map(assignments.map((a) => [a.slot, a]));
  return [{
    name: 'Noble Advisor',
    aoa: [['Noble Advisor', 'Flamedragon Tyrant'], ['Start Time (UTC)', 'Member', 'Member ID'], ...SLOT_OPTIONS.map((s) => [s.value, bySlot.get(s.value)?.name || (bySlot.get(s.value) ? bySlot.get(s.value).member_id : 'Open spot'), bySlot.get(s.value)?.member_id || ''])],
  }];
}
