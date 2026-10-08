// Prep Week appointment scheduler. Pure functions, no dependencies.
// Produces per-day schedules of 49 thirty-minute slots each.

export const APPOINTMENTS = [
  '23:45', '00:15', '00:45', '01:15', '01:45', '02:15', '02:45', '03:15', '03:45', '04:15',
  '04:45', '05:15', '05:45', '06:15', '06:45', '07:15', '07:45', '08:15', '08:45', '09:15',
  '09:45', '10:15', '10:45', '11:15', '11:45', '12:15', '12:45', '13:15', '13:45', '14:15',
  '14:45', '15:15', '15:45', '16:15', '16:45', '17:15', '17:45', '18:15', '18:45', '19:15',
  '19:45', '20:15', '20:45', '21:15', '21:45', '22:15', '22:45', '23:15', '23:45',
];

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

function placeGreedy(ranked, availKey) {
  const slots = APPOINTMENTS.map(() => null);
  for (const player of ranked) {
    const avail = new Set(player[availKey] || []);
    for (let i = 0; i < APPOINTMENTS.length; i += 1) {
      if (slots[i] === null && avail.has(APPOINTMENTS[i])) { slots[i] = player; break; }
    }
  }
  return slots;
}

export function schedule(rows, { day4Slots = APPOINTMENTS } = {}) {
  const clean = (rows || []).filter((r) => r && (r.member_id || r.in_game_name));

  const consEligible = clean.filter((r) => isYes(r.want_construction));
  const consRanked = consEligible.slice().sort(comparator([
    (r) => tgRank(r.construction_upgrades),
    (r) => toNumber(r.ttg_used),
    (r) => toNumber(r.tg_used),
  ], 'avail_day1'));
  const day1 = placeGreedy(consRanked, 'avail_day1');

  const resEligible = clean.filter((r) => isYes(r.want_research));
  const resRanked = resEligible.slice().sort(comparator([
    (r) => ((r.t11_troops || []).length > 0 ? 1 : 0),
    (r) => toNumber(r.research_speedup_days),
    (r) => toNumber(r.tg_dust),
  ], 'avail_day2'));

  let crossoverId = null;
  const resIds = new Set(resEligible.map((r) => r.id));
  for (let i = day1.length - 1; i >= 0; i -= 1) {
    const p = day1[i];
    if (p && resIds.has(p.id) && (p.avail_day2 || []).includes(APPOINTMENTS[0])) { crossoverId = p.id; break; }
  }
  const day2 = APPOINTMENTS.map(() => null);
  let day2Pool = resRanked;
  if (crossoverId != null) {
    const cross = resRanked.find((r) => r.id === crossoverId);
    day2[0] = cross || null;
    day2Pool = resRanked.filter((r) => r.id !== crossoverId);
  }
  for (const player of day2Pool) {
    const avail = new Set(player.avail_day2 || []);
    for (let i = 0; i < APPOINTMENTS.length; i += 1) {
      if (day2[i] === null && avail.has(APPOINTMENTS[i])) { day2[i] = player; break; }
    }
  }

  const ttEligible = clean.filter((r) => isYes(r.want_troop_training));
  const ttRanked = ttEligible.slice().sort(comparator([
    (r) => (isYes(r.is_transfer) ? 1 : 0),
    (r) => (isYes(r.promoting_t11) ? 1 : 0),
    (r) => toNumber(r.troop_speedup_days),
  ], 'avail_day4'));
  const slotsFor = (days) => Math.min(8, 1 + Math.floor(toNumber(days) / 600));
  const day4 = day4Slots.map(() => null);
  const multiSlot = new Set();
  for (const player of ttRanked) {
    const want = slotsFor(player.troop_speedup_days);
    const avail = new Set(player.avail_day4 || []);
    let placed = 0;
    for (let i = 0; i < day4Slots.length && placed < want; i += 1) {
      if (day4[i] === null && avail.has(day4Slots[i])) { day4[i] = player; placed += 1; }
    }
    if (placed > 1) multiSlot.add(player.id);
  }

  const day1Ids = new Set(day1.filter(Boolean).map((p) => p.id));
  const day2Ids = new Set(day2.filter(Boolean).map((p) => p.id));
  const overflow = clean.filter((r) => ((isYes(r.want_construction) && !day1Ids.has(r.id)) || (isYes(r.want_research) && !day2Ids.has(r.id))));
  const overflowRanked = overflow.slice().sort(comparator([
    (r) => tgRank(r.construction_upgrades),
    (r) => toNumber(r.research_speedup_days),
    (r) => toNumber(r.ttg_used),
  ], 'avail_day5'));
  const day5 = placeGreedy(overflowRanked, 'avail_day5');

  const toName = (p) => (p ? (p.in_game_name || p.member_id || '') : OPEN_SPOT);
  const buildRows = (slots, grid = APPOINTMENTS) => grid.map((t, i) => ({ time: t, member: toName(slots[i]), multi: slots[i] ? multiSlot.has(slots[i].id) : false }));

  return {
    days: [
      { day: 1, position: 'Construction (Chief Minister)', rows: buildRows(day1) },
      { day: 2, position: 'Research (Chief Minister)', rows: buildRows(day2) },
      { day: 4, position: 'Troop Training (Noble Advisor)', rows: buildRows(day4, day4Slots) },
      { day: 5, position: 'Construction & Research overflow (Chief Minister)', rows: buildRows(day5) },
    ],
    crossoverId,
    multiSlot: Array.from(multiSlot),
  };
}
