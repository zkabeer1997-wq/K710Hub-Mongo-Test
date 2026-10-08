// Prep Week appointment scheduler. Pure functions, no dependencies.
// Produces per-day schedules of 48 thirty-minute slots each (00:00 ... 23:30 UTC).
import { NOBLE_TIME_SLOTS } from '../../../lib/nobleAdvisor.mjs';

// Same half-hour grid as the Noble Advisor: 00:00, 00:30 ... 23:30 (48 slots).
export const APPOINTMENTS = NOBLE_TIME_SLOTS;

// OWNER DECISION (KvK Prep & Appointments): NO MORE THAN 1 SLOT PER MEMBER PER DAY.
// This overrides the old Day 4 rule that gave one extra slot per 600 troop speedup days
// (up to 8). The ranking is unchanged; the 600-day rule now only used to decide how many
// slots a player asked for, so it no longer has any effect at all.
export const MAX_SLOTS_PER_DAY = 1;

export const OPEN_SPOT = 'Open spot, Contact Slim if interested.';

export function toNumber(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[,\s+]/g, '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

export function isYes(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  return v === 'yes' || v === 'y';
}

function tgRank(upgrades) {
  const order = { TG8: 4, TG7: 3, TG6: 2, TG5: 1 };
  let best = 0;
  (upgrades || []).forEach((u) => {
    const key = String(u).slice(0, 3).toUpperCase();
    if (order[key] && order[key] > best) best = order[key];
  });
  return best;
}

function tieBreak(a, b, availKey) {
  const aAvail = (a[availKey] || []).length;
  const bAvail = (b[availKey] || []).length;
  if (aAvail !== bAvail) return aAvail - bAvail;
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (aTime !== bTime) return aTime - bTime;
  const aName = String(a.in_game_name || '').toLowerCase();
  const bName = String(b.in_game_name || '').toLowerCase();
  if (aName !== bName) return aName < bName ? -1 : 1;
  return toNumber(a.member_id) - toNumber(b.member_id);
}

function comparator(rankFns, availKey) {
  return (a, b) => {
    for (const fn of rankFns) {
      const d = fn(b) - fn(a);
      if (d !== 0) return d;
    }
    return tieBreak(a, b, availKey);
  };
}

// Fill the grid in rank order. Each player takes at most MAX_SLOTS_PER_DAY slots.
// `fixed` maps slot -> already placed (locked) player; those slots are not offered.
function placeGreedy(ranked, availKey, grid = APPOINTMENTS, fixed = null) {
  const slots = grid.map((t) => (fixed && fixed.get(t)) || null);
  const placedIds = new Set(slots.filter(Boolean).map((p) => p.id));
  for (const player of ranked) {
    if (placedIds.has(player.id)) continue;
    const avail = new Set(player[availKey] || []);
    let placed = 0;
    for (let i = 0; i < grid.length && placed < MAX_SLOTS_PER_DAY; i += 1) {
      if (slots[i] === null && avail.has(grid[i])) { slots[i] = player; placed += 1; }
    }
    if (placed) placedIds.add(player.id);
  }
  return slots;
}

// Rank of each eligible player for a day: higher criteria first, then tieBreak. Used both by the
// scheduler and by the admin table ("rank per day").
const RANKERS = {
  1: { want: 'want_construction', avail: 'avail_day1', fns: [
    (r) => tgRank(r.construction_upgrades), (r) => toNumber(r.ttg_used), (r) => toNumber(r.tg_used)] },
  2: { want: 'want_research', avail: 'avail_day2', fns: [
    (r) => ((r.t11_troops || []).length > 0 ? 1 : 0), (r) => toNumber(r.research_speedup_days), (r) => toNumber(r.tg_dust)] },
  4: { want: 'want_troop_training', avail: 'avail_day4', fns: [
    (r) => (isYes(r.is_transfer) ? 1 : 0), (r) => (isYes(r.promoting_t11) ? 1 : 0), (r) => toNumber(r.troop_speedup_days)] },
  5: { want: null, avail: 'avail_day5', fns: [
    (r) => tgRank(r.construction_upgrades), (r) => toNumber(r.research_speedup_days), (r) => toNumber(r.ttg_used)] },
};

function rankFor(day, pool) {
  const cfg = RANKERS[day];
  return pool.slice().sort(comparator(cfg.fns, cfg.avail));
}

/** One row per member id (first wins) so nobody can be booked twice from duplicate answers. */
function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r || !(r.member_id || r.in_game_name)) continue;
    const key = r.member_id ? `m:${r.member_id}` : null;
    if (key) { if (seen.has(key)) continue; seen.add(key); }
    out.push(r);
  }
  return out;
}

/** { 1: [id...], 2: [...], 4: [...] } ranked member ids per day among those who want that day. */
export function rankByDay(rows) {
  const clean = dedupe(rows || []);
  const out = {};
  for (const day of [1, 2, 4]) {
    out[day] = rankFor(day, clean.filter((r) => isYes(r[RANKERS[day].want]))).map((r) => String(r.member_id || r.id));
  }
  return out;
}

const DAY_META = {
  1: 'Construction (Chief Minister)',
  2: 'Research (Chief Minister)',
  4: 'Troop Training (Noble Advisor)',
  5: 'Construction & Research overflow (Chief Minister)',
};

/**
 * Rank everyone and fill each day's 30-minute grid.
 * options.day4Slots  grid for Day 4 (default: the 48 half-hours)
 * options.locked     { [day]: [{ member_id, slot, name? }] } manual placements that must stay:
 *                    their slots are not offered and their members are not placed again that day.
 * Returns days[].rows[] = { time, member, member_id, multi, locked } plus `unplaced`
 * ([{ day, member_id, name, reason }]) for players who asked for a day but got no slot.
 */
export function schedule(rows, { day4Slots = APPOINTMENTS, locked = {} } = {}) {
  const clean = dedupe(rows || []);
  const byMember = new Map(clean.map((r) => [String(r.member_id), r]));
  const fixedFor = (day) => {
    const fixed = new Map();
    for (const l of locked[day] || []) {
      const base = byMember.get(String(l.member_id));
      fixed.set(l.slot, { ...(base || {}), id: base ? base.id : `locked:${l.member_id}`, member_id: String(l.member_id), in_game_name: base?.in_game_name || l.name || String(l.member_id), __locked: true });
    }
    return fixed;
  };

  const fixed1 = fixedFor(1); const fixed2 = fixedFor(2); const fixed4 = fixedFor(4); const fixed5 = fixedFor(5);
  const pool = (day) => rankFor(day, clean.filter((r) => isYes(r[RANKERS[day].want])));
  const day1 = placeGreedy(pool(1), 'avail_day1', APPOINTMENTS, fixed1);
  const day2 = placeGreedy(pool(2), 'avail_day2', APPOINTMENTS, fixed2);
  const day4 = placeGreedy(pool(4), 'avail_day4', day4Slots, fixed4);

  const idsOf = (slots) => new Set(slots.filter(Boolean).map((p) => String(p.member_id)));
  const day1Ids = idsOf(day1);
  const day2Ids = idsOf(day2);
  const overflow = clean.filter((r) => ((isYes(r.want_construction) && !day1Ids.has(String(r.member_id))) || (isYes(r.want_research) && !day2Ids.has(String(r.member_id)))));
  const day5 = placeGreedy(rankFor(5, overflow), 'avail_day5', APPOINTMENTS, fixed5);
  const day5Ids = idsOf(day5);

  const toName = (p) => (p ? (p.in_game_name || p.member_id || '') : OPEN_SPOT);
  const buildRows = (slots, grid = APPOINTMENTS) => grid.map((t, i) => ({
    time: t, member: toName(slots[i]), member_id: slots[i] ? String(slots[i].member_id || '') : '', multi: false, locked: Boolean(slots[i] && slots[i].__locked),
  }));

  const unplaced = [];
  const why = (r, key) => ((r[key] || []).length ? 'No free slot in the times this member picked' : 'This member picked no times for this day');
  const note = (day, r) => unplaced.push({ day, member_id: String(r.member_id || ''), name: r.in_game_name || '', reason: why(r, RANKERS[day].avail) });
  pool(1).forEach((r) => { if (!day1Ids.has(String(r.member_id)) && !day5Ids.has(String(r.member_id))) note(1, r); });
  pool(2).forEach((r) => { if (!day2Ids.has(String(r.member_id)) && !day5Ids.has(String(r.member_id))) note(2, r); });
  pool(4).forEach((r) => { if (!idsOf(day4).has(String(r.member_id))) note(4, r); });

  return {
    days: [
      { day: 1, position: DAY_META[1], rows: buildRows(day1) },
      { day: 2, position: DAY_META[2], rows: buildRows(day2) },
      { day: 4, position: DAY_META[4], rows: buildRows(day4, day4Slots) },
      { day: 5, position: DAY_META[5], rows: buildRows(day5) },
    ],
    unplaced,
    crossoverId: null,
    multiSlot: [],
  };
}
