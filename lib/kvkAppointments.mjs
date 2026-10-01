// KvK appointment flow (minister / advisor buffs). Pure functions only: no
// React, no Mongo, safe for client and server, covered by
// tests/kvkAppointments.test.mjs.
//
// Vocabulary
//   type      one (day, buff) pair, e.g. Day 1 Construction
//   hour      a whole UTC hour ("14:00") a member says they can attend
//   slot      a 30-minute UTC appointment ("14:00" or "14:30")
//   cycle     one KvK run; the form gate's cycle_id ("current" by default)

import { toNumber } from '../app/admin/dashboard/prepScheduler.mjs';

/**
 * Appointment types. The day/buff pairs mirror the existing Prep Week
 * scheduler (app/admin/dashboard/prepScheduler.mjs): Day 1 Construction and
 * Day 2 Research with the Chief Minister, Day 4 Troop Training with the Noble
 * Advisor. Day 5 there is an overflow re-run of days 1-2 and is handled by an
 * admin assigning leftover applicants by hand, so members do not apply to it.
 */
export const APPOINTMENT_TYPES = [
  { day: 1, buff: 'construction', label: 'Construction', role: 'Chief Minister' },
  { day: 2, buff: 'research', label: 'Research', role: 'Chief Minister' },
  { day: 4, buff: 'training', label: 'Troop Training', role: 'Noble Advisor' },
];

export const DEFAULT_CYCLE_ID = 'current';
export const PREFERRED_HOUR_COUNT = 3;
export const MAX_AMOUNT = 1e12;

export function findType(day, buff) {
  const d = Number(day);
  return APPOINTMENT_TYPES.find((t) => t.day === d && t.buff === buff) || null;
}

export function typeKey(type) {
  return `${type.day}:${type.buff}`;
}

/** "Day 1 Construction" */
export function typeTitle(type) {
  return `Day ${type.day} ${type.label}`;
}

const pad = (n) => String(n).padStart(2, '0');

/** "HH:MM" for a minute-of-day value. */
function hhmm(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Every slot of `stepMinutes` across one UTC day: 24 hours or 48 half-hours. */
export function generateTimeOptions(stepMinutes = 60) {
  const step = [30, 60].includes(stepMinutes) ? stepMinutes : 60;
  const out = [];
  for (let m = 0; m < 24 * 60; m += step) {
    out.push({ value: hhmm(m), utcMinutes: m, utc: hhmm(m), endUtc: hhmm((m + step) % (24 * 60)), step });
  }
  return out;
}

/** The 24 selectable hours (UTC) for the preferred-hours picker. */
export const HOUR_OPTIONS = generateTimeOptions(60);
/** The 48 thirty-minute appointment slots (UTC) of one day. */
export const SLOT_OPTIONS = generateTimeOptions(30);

const HOUR_VALUES = new Set(HOUR_OPTIONS.map((o) => o.value));
const SLOT_VALUES = new Set(SLOT_OPTIONS.map((o) => o.value));

export const isValidHour = (v) => HOUR_VALUES.has(v);
export const isValidSlot = (v) => SLOT_VALUES.has(v);

/** "02:00–02:30" (UTC) for a slot value; null when the slot is invalid. */
export function slotRange(slot) {
  const option = SLOT_OPTIONS.find((o) => o.value === slot);
  return option ? `${option.utc}–${option.endUtc}` : null;
}

/**
 * Local-time label for a UTC "HH:MM" value on a reference date, e.g. "9:00 PM".
 * Uses Intl, so it follows the viewer's zone (or `timeZone`) including DST on
 * that date. Returns '' if Intl rejects the zone. Not used during SSR.
 */
export function localTimeLabel(utcHHMM, refDate = new Date(), timeZone) {
  const [h, m] = String(utcHHMM).split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return '';
  const d = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), h, m));
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(d);
  } catch {
    return '';
  }
}

/** "9:00 PM–9:30 PM" local for a slot; '' when unavailable. */
export function localSlotRange(slot, refDate = new Date(), timeZone) {
  const option = SLOT_OPTIONS.find((o) => o.value === slot);
  if (!option) return '';
  const a = localTimeLabel(option.utc, refDate, timeZone);
  const b = localTimeLabel(option.endUtc, refDate, timeZone);
  return a && b ? `${a}–${b}` : '';
}

// ---------------------------------------------------------------- contribution

/**
 * CONTRIBUTION FORMULA (single source of truth).
 *
 *   score = tg * 1 + ttg * 2 + speedup_days * 100
 *
 * - tg            TG the member spent this cycle (>= 0)
 * - ttg           TTG the member spent this cycle (>= 0); weighted double
 *                 because the existing Prep Week scheduler ranks TTG ahead of
 *                 TG on Construction day
 * - speedup_days  speedup stockpile, in days (>= 0); one day counts as 100
 *                 units so that a typical few hundred days is comparable to
 *                 millions of TG
 *
 * The weights are an ASSUMPTION chosen to be simple and monotonic: more of any
 * input never lowers a score. They are not game data; leadership can retune
 * them here (one place) and the tests pin the ordering behaviour, not the
 * exact numbers. Missing/invalid inputs count as 0. Same weights for every
 * buff so the ranking is easy to explain to members.
 */
export const CONTRIBUTION_WEIGHTS = Object.freeze({ tg: 1, ttg: 2, speedup_days: 100 });

export function contributionScore({ tg, ttg, speedup_days: speedupDays } = {}) {
  const clean = (v) => { const n = toNumber(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  return clean(tg) * CONTRIBUTION_WEIGHTS.tg + clean(ttg) * CONTRIBUTION_WEIGHTS.ttg + clean(speedupDays) * CONTRIBUTION_WEIGHTS.speedup_days;
}

// ---------------------------------------------------------------- validation

function parseAmount(value, { decimals = false } = {}) {
  if (value === '' || value === null || value === undefined) return 0;
  const cleaned = String(value).trim().replace(/[,\s_]/g, '');
  const pattern = decimals ? /^\d+(\.\d{1,2})?$/ : /^\d+$/;
  if (!pattern.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= MAX_AMOUNT ? n : null;
}

/**
 * Validate a member application. Exactly PREFERRED_HOUR_COUNT distinct valid
 * UTC hours are required (order is kept: earlier picks are tried first).
 */
export function validateApplication(body) {
  const type = findType(body?.day, String(body?.buff || ''));
  if (!type) return { error: 'Choose a valid day and buff.' };
  const tg = parseAmount(body?.tg);
  const ttg = parseAmount(body?.ttg);
  const speedup = parseAmount(body?.speedup_days, { decimals: true });
  if (tg === null) return { error: 'Enter TG as a whole number (0 if none).' };
  if (ttg === null) return { error: 'Enter TTG as a whole number (0 if none).' };
  if (speedup === null) return { error: 'Enter speedup days as a number (0 if none).' };
  const hoursIn = Array.isArray(body?.preferred_hours) ? body.preferred_hours : null;
  if (!hoursIn || hoursIn.some((h) => typeof h !== 'string' || !isValidHour(h))) {
    return { error: `Pick exactly ${PREFERRED_HOUR_COUNT} preferred hours.` };
  }
  const hours = [...new Set(hoursIn)];
  if (hours.length !== PREFERRED_HOUR_COUNT || hoursIn.length !== PREFERRED_HOUR_COUNT) {
    return { error: `Pick exactly ${PREFERRED_HOUR_COUNT} different preferred hours.` };
  }
  const name = String(body?.in_game_name ?? '').trim();
  if (name.length > 120) return { error: 'In-game name is too long (120 characters max).' };
  return {
    value: { day: type.day, buff: type.buff, tg, ttg, speedup_days: speedup, preferred_hours: hours, in_game_name: name },
    type,
  };
}

export function validateManualAssignment(body) {
  const type = findType(body?.day, String(body?.buff || ''));
  if (!type) return { error: 'Choose a valid day and buff.' };
  const memberId = String(body?.member_id ?? '').trim();
  if (!memberId || memberId.length > 64) return { error: 'Choose a member.' };
  if (!isValidSlot(body?.slot)) return { error: 'Choose a valid 30-minute slot.' };
  return { value: { day: type.day, buff: type.buff, member_id: memberId, slot: body.slot } };
}

// ---------------------------------------------------------------- allocation

function createdMs(a) {
  const ms = a.created_at ? new Date(a.created_at).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Deterministic ranking: higher score first; ties by earlier application,
 * then by member id (numeric when both are numeric, otherwise text order).
 */
export function compareApplicants(a, b) {
  const d = (b.score ?? contributionScore(b)) - (a.score ?? contributionScore(a));
  if (d !== 0) return d;
  const t = createdMs(a) - createdMs(b);
  if (t !== 0) return t;
  const x = String(a.member_id); const y = String(b.member_id);
  if (/^\d+$/.test(x) && /^\d+$/.test(y) && x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Slots inside a preferred hour, earliest first: "14:00" -> ["14:00", "14:30"]. */
export function slotsInHour(hour) {
  return isValidHour(hour) ? [hour, `${hour.slice(0, 2)}:30`] : [];
}

/**
 * Allocate 30-minute slots for one (day, buff).
 *
 * @param {object[]} applications  each { member_id, tg, ttg, speedup_days, preferred_hours, created_at }
 * @param {object[]} [locked]      assignments to keep ({ member_id, slot }); their
 *   slots are unavailable and their members are skipped (admin manual picks)
 * @returns {{ assignments: {member_id, slot, score}[], unassigned: {member_id, score, reason}[] }}
 *
 * Applicants are processed best-score first. Each takes the first free slot
 * within their preferred hours (pick order, earlier half hour first). At most
 * one slot per member; a slot is never given twice. Pure and deterministic:
 * the same input always yields the same output. Applicants with no free slot
 * in their preferred hours stay unassigned for an admin to place by hand.
 */
export function allocateSlots(applications, locked = []) {
  const taken = new Set(locked.map((l) => l.slot));
  const done = new Set(locked.map((l) => String(l.member_id)));
  const seen = new Set();
  const ranked = [];
  for (const app of applications || []) {
    const id = String(app?.member_id ?? '');
    if (!id || seen.has(id)) continue; // one application per member (first wins)
    seen.add(id);
    ranked.push({ ...app, member_id: id, score: contributionScore(app) });
  }
  ranked.sort(compareApplicants);
  const assignments = [];
  const unassigned = [];
  for (const app of ranked) {
    if (done.has(app.member_id)) continue;
    let slot = null;
    for (const hour of app.preferred_hours || []) {
      slot = slotsInHour(hour).find((s) => !taken.has(s)) || null;
      if (slot) break;
    }
    if (slot) {
      taken.add(slot);
      assignments.push({ member_id: app.member_id, slot, score: app.score });
    } else {
      unassigned.push({ member_id: app.member_id, score: app.score, reason: 'All slots in the preferred hours are taken.' });
    }
  }
  return { assignments, unassigned };
}

/** True when no slot or member repeats inside one (day, buff) list. */
export function hasNoDoubleBooking(assignments) {
  const slots = new Set(); const members = new Set();
  for (const a of assignments) {
    if (slots.has(a.slot) || members.has(String(a.member_id))) return false;
    slots.add(a.slot); members.add(String(a.member_id));
  }
  return true;
}

// ---------------------------------------------------------------- member view

export const STATUS_LABELS = { not_applied: 'Not applied', pending: 'Pending', assigned: 'Assigned' };

/**
 * One row per appointment type for "My Appointments". Assignments only count
 * when the schedule is published; until then an applicant is "Pending".
 * `text` always carries the status in words (never colour alone):
 *   "Day 1 Construction: Not applied" / "... Pending" / "... Assigned 02:00–02:30"
 */
export function myAppointmentRows({ applications = [], assignments = [], published = false }) {
  return APPOINTMENT_TYPES.map((type) => {
    const app = applications.find((a) => Number(a.day) === type.day && a.buff === type.buff) || null;
    const asg = published ? assignments.find((a) => Number(a.day) === type.day && a.buff === type.buff) || null : null;
    const status = asg ? 'assigned' : app ? 'pending' : 'not_applied';
    const slot = asg ? asg.slot : null;
    const range = slot ? slotRange(slot) : null;
    return {
      ...type,
      title: typeTitle(type),
      status,
      statusLabel: STATUS_LABELS[status],
      slot,
      range,
      application: app,
      text: `${typeTitle(type)}: ${STATUS_LABELS[status]}${range ? ` ${range}` : ''}`,
    };
  });
}

/** Group a flat assignment list into the schedule grid: all 48 slots per type. */
export function buildSchedule(assignments = []) {
  return APPOINTMENT_TYPES.map((type) => {
    const bySlot = new Map(assignments.filter((a) => Number(a.day) === type.day && a.buff === type.buff).map((a) => [a.slot, a]));
    return {
      ...type,
      title: typeTitle(type),
      slots: SLOT_OPTIONS.map((s) => ({ slot: s.value, range: `${s.utc}–${s.endUtc}`, name: bySlot.get(s.value)?.name || null })),
      filled: bySlot.size,
    };
  });
}
