// Pure helpers for the member-facing "My appointment" page and the one-line summary on the forms
// list. The member asks for buffs in the KvK Prep & Appointments form; leadership publishes the
// assignments; this file turns (prep answers + published assignments + cycle start) into words.
import { APPOINTMENT_TYPES, typeTitle, slotRange } from './kvkAppointments.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Which prep-form answer says the member wants this buff. */
export const WANT_FIELD = { construction: 'want_construction', research: 'want_research', training: 'want_troop_training' };

/** UTC midnight of prep day `day` (day 1 = the cycle start date), or null when the start is unknown. */
export function prepDayDate(cycleStart, day) {
  const raw = String(cycleStart ?? '').trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const base = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.parse(raw);
  if (!Number.isFinite(base)) return null;
  const d = new Date(base);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(midnight + (Math.max(1, Number(day) || 1) - 1) * 86400000);
}

/** "Oct 21" for a UTC date. */
export function shortUtcDate(date) {
  return date ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}` : '';
}

/** Exact instant of a slot ("14:30") on a prep day, or null without a cycle start. */
export function slotInstant(cycleStart, day, slot) {
  const date = prepDayDate(cycleStart, day);
  const m = /^(\d{2}):(\d{2})$/.exec(String(slot || ''));
  if (!date || !m) return null;
  return new Date(date.getTime() + Number(m[1]) * 3600000 + Number(m[2]) * 60000);
}

/** "Day 1 Construction: Oct 21, 14:30 UTC" (date omitted when the cycle has no start date). */
export function appointmentLine({ day, buff, slot }, cycleStart) {
  const type = APPOINTMENT_TYPES.find((t) => t.day === Number(day) && t.buff === buff);
  if (!type) return '';
  const date = shortUtcDate(prepDayDate(cycleStart, day));
  return `${typeTitle(type)}: ${date ? `${date}, ` : ''}${slot} UTC`;
}

/**
 * One row per buff. status:
 *  placed     - leadership gave the member a time (slot set)
 *  not_placed - published, the member asked for it, but no free time in their selected times
 *  waiting    - not published yet and the member asked for it
 *  not_asked  - the member did not ask for this buff (or has not saved the form)
 */
export function myAppointmentView({ prep = null, assignments = [], published = false, cycleStart = null } = {}) {
  return APPOINTMENT_TYPES.map((type) => {
    const asg = published ? assignments.find((a) => Number(a.day) === type.day && a.buff === type.buff) : null;
    const wanted = prep?.[WANT_FIELD[type.buff]] === 'Yes';
    let status = 'not_asked';
    if (asg) status = 'placed';
    else if (wanted) status = published ? 'not_placed' : 'waiting';
    const date = shortUtcDate(prepDayDate(cycleStart, type.day));
    return {
      ...type,
      title: typeTitle(type),
      status,
      wanted,
      slot: asg ? asg.slot : null,
      range: asg ? slotRange(asg.slot) : null,
      dateLabel: date,
      line: asg ? appointmentLine(asg, cycleStart) : '',
    };
  });
}
