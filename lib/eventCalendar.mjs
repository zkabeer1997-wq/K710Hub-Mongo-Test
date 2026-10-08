// Pure calendar helpers (no React) shared by the admin and member calendars.
// Dates are stored in UTC; every helper takes `utc` (true = kingdom clock, false = viewer's local zone).
import { expandOccurrences, recurrenceLabel, WEEKDAY_NAMES } from './eventRecurrence.mjs';
import { eventAllianceLabel } from './eventFields.mjs';

export const HOUR = 3600000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const monthName = m => MONTHS[m];
export const dayName = d => DAYS[d];
const pad = n => String(n).padStart(2, '0');

export function tzParts(ms, utc) {
  const d = new Date(ms);
  return utc
    ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }
    : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), dow: d.getDay() };
}

export function makeMs(y, m, d, h = 0, mi = 0, utc = true) {
  return utc ? Date.UTC(y, m, d, h, mi) : new Date(y, m, d, h, mi).getTime();
}

export const dayKey = (ms, utc) => { const p = tzParts(ms, utc); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`; };
export const clock = (ms, utc) => { const p = tzParts(ms, utc); return `${pad(p.h)}:${pad(p.mi)}`; };
export const utcClock = ms => `${clock(ms, true)} UTC`;

export function dayBounds(y, m, d, utc) {
  return { startMs: makeMs(y, m, d, 0, 0, utc), endMs: makeMs(y, m, d + 1, 0, 0, utc) };
}

function dayInfo(y, m, d, utc) {
  const { startMs, endMs } = dayBounds(y, m, d, utc);
  const p = tzParts(startMs + 2 * HOUR, utc); // normalised y/m/d/dow even across month overflow
  return { key: `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`, y: p.y, m: p.m, d: p.d, dow: p.dow, startMs, endMs };
}

// The visible days for a view, plus the [from, to) window to expand occurrences over.
export function viewDays(view, anchorMs, utc) {
  const a = tzParts(anchorMs, utc);
  let days = [];
  if (view === 'day') days = [dayInfo(a.y, a.m, a.d, utc)];
  else if (view === 'week') days = Array.from({ length: 7 }, (_, i) => dayInfo(a.y, a.m, a.d - a.dow + i, utc));
  else {
    const first = tzParts(makeMs(a.y, a.m, 1, 12, 0, utc), utc);
    days = Array.from({ length: 42 }, (_, i) => dayInfo(a.y, a.m, 1 - first.dow + i, utc));
  }
  return { days, from: days[0].startMs, to: days[days.length - 1].endMs };
}

export function shiftAnchor(view, anchorMs, dir, utc) {
  const a = tzParts(anchorMs, utc);
  if (view === 'month') return makeMs(a.y, a.m + dir, 1, 12, 0, utc);
  return makeMs(a.y, a.m, a.d + dir * (view === 'week' ? 7 : 1), 12, 0, utc);
}

// Occurrence objects for a window, sorted by start. `event` keeps the series row.
export function occurrencesInRange(events, from, to, limitPerEvent = 400) {
  const out = [];
  for (const event of events) {
    for (const occ of expandOccurrences(event, from, to, limitPerEvent)) {
      out.push({ event, startMs: Date.parse(occ.starts_at), endMs: occ.ends_at ? Date.parse(occ.ends_at) : null, starts_at: occ.starts_at, ends_at: occ.ends_at, key: `${event.slug}@${occ.starts_at}` });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || String(a.event.title).localeCompare(String(b.event.title)));
}

export function occurrencesOnDay(items, day) {
  return items.filter(o => o.startMs < day.endMs && (o.endMs ?? o.startMs + 1) > day.startMs);
}

// All-day events and anything running a day or longer sit in the all-day strip, not the hour grid.
export function isAllDay(o) {
  return Boolean(o.event.all_day) || (o.endMs !== null && o.endMs - o.startMs >= 24 * HOUR);
}

export function describeOccurrence(o, utc) {
  const p = tzParts(o.startMs, utc);
  const date = `${DAYS[p.dow]} ${MONTHS[p.m].slice(0, 3)} ${p.d}`;
  const time = isAllDay(o) ? 'all day' : `${clock(o.startMs, utc)} ${utc ? 'UTC' : 'local time'}`;
  const repeats = o.event.recurrence_frequency && o.event.recurrence_frequency !== 'none' ? `, repeats ${recurrenceLabel(o.event).split(' · ')[0].toLowerCase()}` : '';
  return `${o.event.title}, ${date}, ${time}${repeats}`;
}

// "Thu Oct 8, 22:00" in the chosen zone (local uses the viewer's zone).
export function shortDateTime(ms, utc) {
  const p = tzParts(ms, utc);
  return `${DAYS[p.dow].slice(0, 3)} ${MONTHS[p.m].slice(0, 3)} ${p.d}, ${pad(p.h)}:${pad(p.mi)}`;
}

export function rangeLabel(view, days, utc) {
  const first = days[0];
  if (view === 'month') { const mid = days[15]; return `${MONTHS[mid.m]} ${mid.y}`; }
  if (view === 'day') return `${DAYS[first.dow]}, ${MONTHS[first.m]} ${first.d}, ${first.y}`;
  const last = days[days.length - 1];
  return `${MONTHS[first.m].slice(0, 3)} ${first.d} – ${MONTHS[last.m].slice(0, 3)} ${last.d}, ${last.y}`;
}

// Next occurrence per series for the member table; Bear Hunts have their own section.
export function summarizeSeries(entries) {
  return entries.map(({ event, occurrence }) => ({
    slug: event.slug, title: event.title, kind: event.kind, starts_at: occurrence.starts_at, ends_at: occurrence.ends_at || null,
    all_day: Boolean(event.all_day), repeats: recurrenceLabel(event), alliance: eventAllianceLabel(event), guide_slug: event.guide_slug || null,
  }));
}

export { WEEKDAY_NAMES };
