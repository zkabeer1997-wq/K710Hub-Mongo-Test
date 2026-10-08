// UTC schedules, matching the kingdom clock and RFC 5545 calendar exports.
export const RECURRENCE_FIELDS = 'recurrence_frequency, recurrence_interval, recurrence_until, recurrence_weekdays, exdates, all_day';
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const MAX_EXDATES = 400;
const FREQUENCIES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const DAY = 86400000;

export function validateEventSchedule(event) {
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return { error: 'A valid start date/time is required.' };
  const end = event.ends_at ? Date.parse(event.ends_at) : null;
  if (end !== null && (!Number.isFinite(end) || end <= start)) return { error: 'End time must be after the start time.' };
  const frequency = event.recurrence_frequency ?? 'none';
  if (!FREQUENCIES.includes(frequency)) return { error: 'Choose a supported repeat frequency.' };
  const interval = frequency === 'none' ? 1 : Number(event.recurrence_interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return { error: 'Repeat interval must be a whole number from 1 to 365.' };
  let until = null;
  if (frequency !== 'none' && event.recurrence_until) {
    const value = event.recurrence_until;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return { error: 'Choose a valid repeat stop date.' };
    if (Date.parse(`${value}T23:59:59.999Z`) < start) return { error: 'Repeat stop date cannot be before the first event.' };
    until = value;
  }
  // Additive fields: weekly repeat days (UTC weekdays, 0 = Sunday), skipped single
  // occurrences (ISO start instants) and an all-day display flag.
  let weekdays = null;
  if (frequency === 'weekly' && event.recurrence_weekdays != null && event.recurrence_weekdays !== '') {
    const list = Array.isArray(event.recurrence_weekdays) ? event.recurrence_weekdays.map(Number) : null;
    if (!list || list.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return { error: 'Choose weekdays between Sunday and Saturday.' };
    const unique = [...new Set(list)].sort((a, b) => a - b);
    weekdays = unique.length ? unique : null;
  }
  let exdates = [];
  if (event.exdates != null) {
    if (!Array.isArray(event.exdates) || event.exdates.length > MAX_EXDATES) return { error: 'Skipped dates must be a list of at most 400 entries.' };
    const parsed = event.exdates.map(value => (typeof value === 'string' ? Date.parse(value) : NaN));
    if (parsed.some(ms => !Number.isFinite(ms))) return { error: 'Skipped dates must be valid date/times.' };
    exdates = [...new Set(parsed.map(ms => new Date(ms).toISOString()))].sort();
  }
  return { schedule: { starts_at: new Date(start).toISOString(), ends_at: end === null ? null : new Date(end).toISOString(), recurrence_frequency: frequency, recurrence_interval: interval, recurrence_until: until, recurrence_weekdays: weekdays, exdates, all_day: Boolean(event.all_day) } };
}

export function recurrenceLabel(event) {
  const frequency = event.recurrence_frequency || 'none';
  if (frequency === 'none') return 'Does not repeat';
  const interval = Number(event.recurrence_interval) || 1;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[frequency];
  const label = interval === 1 ? { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[frequency] : `Every ${interval} ${unit}s`;
  const days = frequency === 'weekly' && Array.isArray(event.recurrence_weekdays) && event.recurrence_weekdays.length ? ` on ${[...event.recurrence_weekdays].sort((a, b) => a - b).map(d => WEEKDAY_NAMES[d]).join(', ')}` : '';
  return `${label}${days}${event.recurrence_until ? ` · through ${event.recurrence_until} (UTC)` : ''}`;
}

export function recurrenceRule(event) {
  if (!event.recurrence_frequency || event.recurrence_frequency === 'none') return null;
  const { schedule, error } = validateEventSchedule(event);
  if (error) return null;
  const byday = schedule.recurrence_weekdays ? `;BYDAY=${schedule.recurrence_weekdays.map(d => RRULE_DAYS[d]).join(',')}` : '';
  return `FREQ=${schedule.recurrence_frequency.toUpperCase()};INTERVAL=${schedule.recurrence_interval}${byday}${schedule.recurrence_until ? `;UNTIL=${schedule.recurrence_until.replaceAll('-', '')}T235959Z` : ''}`;
}

// Return the first ongoing or next occurrence, preserving the original event row.
// Month-end/leap-day dates that do not exist are skipped, as in ICS RRULE.
export function nextEventOccurrence(event, now = Date.now()) {
  const { schedule, error } = validateEventSchedule(event);
  if (error) return null;
  const skipped = new Set(schedule.exdates);
  const duration = schedule.ends_at ? Date.parse(schedule.ends_at) - Date.parse(schedule.starts_at) : 0;
  if (schedule.recurrence_weekdays) {
    const span = Math.max(14, schedule.recurrence_interval * 7 + 8) * DAY;
    let from = now - duration;
    for (let i = 0; i < 4; i++, from += span) {
      const found = expandOccurrences(event, from, from + span, 500).find(o => Date.parse(o.starts_at) + duration > now || (!duration && Date.parse(o.starts_at) >= now));
      if (found) return found;
    }
    return null;
  }
  let found = rawNextOccurrence(event, schedule, now);
  for (let i = 0; found && skipped.has(found.starts_at) && i < MAX_EXDATES + 1; i++) {
    found = rawNextOccurrence(event, schedule, Date.parse(found.starts_at) + duration + 1);
  }
  return found;
}

function rawNextOccurrence(event, schedule, now) {
  const start = Date.parse(schedule.starts_at);
  const duration = schedule.ends_at ? Date.parse(schedule.ends_at) - start : 0;
  const isRelevant = ms => duration ? ms + duration > now : ms >= now;
  const occurrence = ms => ({ ...event, starts_at: new Date(ms).toISOString(), ends_at: duration ? new Date(ms + duration).toISOString() : null });
  if (schedule.recurrence_frequency === 'none') return isRelevant(start) ? occurrence(start) : null;
  const until = schedule.recurrence_until ? Date.parse(`${schedule.recurrence_until}T23:59:59.999Z`) : Infinity;
  const threshold = now - duration;
  const interval = schedule.recurrence_interval;
  const frequency = schedule.recurrence_frequency;
  const anchor = new Date(start);
  if (frequency === 'daily' || frequency === 'weekly') {
    const step = DAY * interval * (frequency === 'weekly' ? 7 : 1);
    let n = Math.max(0, Math.floor((threshold - start) / step));
    let ms = start + n * step;
    if (!isRelevant(ms)) ms = start + (++n) * step;
    return ms <= until && Number.isFinite(new Date(ms).getTime()) ? occurrence(ms) : null;
  }
  const target = new Date(Math.max(start, threshold));
  const months = (target.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + target.getUTCMonth() - anchor.getUTCMonth();
  const stepMonths = interval * (frequency === 'yearly' ? 12 : 1);
  const first = Math.max(0, Math.floor(months / stepMonths));
  // Gregorian dates repeat every 400 years; this bound also covers sparse leap-day schedules.
  for (let n = first; n < first + 4800; n++) {
    const month = anchor.getUTCMonth() + n * stepMonths;
    const date = new Date(start);
    date.setUTCDate(1);
    date.setUTCFullYear(anchor.getUTCFullYear() + Math.floor(month / 12), month % 12, anchor.getUTCDate());
    const ms = date.getTime();
    if (!Number.isFinite(ms) || ms > until) return null;
    if (date.getUTCMonth() !== month % 12 || date.getUTCDate() !== anchor.getUTCDate()) continue;
    if (isRelevant(ms)) return occurrence(ms);
  }
  return null;
}

export function upcomingEventSeries(events, now = Date.now()) {
  return events.map(event => {
    const oneOff = !event.recurrence_frequency || event.recurrence_frequency === 'none';
    // Keep the existing one-day grace period for one-off entries.
    const occurrence = nextEventOccurrence(event, now) || (oneOff && Date.parse(event.starts_at) >= now - DAY ? event : null);
    return { event, occurrence };
  })
    .filter(entry => entry.occurrence)
    .sort((a, b) => Date.parse(a.occurrence.starts_at) - Date.parse(b.occurrence.starts_at));
}

const sundayOf = ms => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - d.getUTCDay() * DAY; };

// Every occurrence overlapping [fromMs, toMs) in start order, with exdates removed.
// Pure UTC arithmetic: the same wall-clock UTC time every time, like the stored series.
export function expandOccurrences(event, fromMs, toMs, limit = 1000) {
  const { schedule, error } = validateEventSchedule(event);
  if (error || !(toMs > fromMs)) return [];
  const start = Date.parse(schedule.starts_at);
  const duration = schedule.ends_at ? Date.parse(schedule.ends_at) - start : 0;
  const make = ms => ({ ...event, starts_at: new Date(ms).toISOString(), ends_at: duration ? new Date(ms + duration).toISOString() : null });
  const skipped = new Set(schedule.exdates);
  const frequency = schedule.recurrence_frequency;
  const out = [];
  const push = ms => { if (!skipped.has(new Date(ms).toISOString()) && ms + duration >= fromMs && ms < toMs) out.push(make(ms)); };
  if (frequency === 'none') { push(start); return out; }
  const until = schedule.recurrence_until ? Date.parse(`${schedule.recurrence_until}T23:59:59.999Z`) : Infinity;
  const interval = schedule.recurrence_interval;
  const anchor = new Date(start);
  const timeOfDay = start - Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const startDay = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const first = Math.max(startDay, Math.floor((fromMs - duration - timeOfDay) / DAY) * DAY);
  const weekdays = schedule.recurrence_weekdays || [anchor.getUTCDay()];
  const anchorWeek = sundayOf(start);
  for (let day = first; day < toMs && out.length < limit; day += DAY) {
    const ms = day + timeOfDay;
    if (ms < start) continue;
    if (ms > until) break;
    const d = new Date(day);
    let hit = false;
    if (frequency === 'daily') hit = Math.round((day - startDay) / DAY) % interval === 0;
    else if (frequency === 'weekly') hit = weekdays.includes(d.getUTCDay()) && Math.round((sundayOf(day) - anchorWeek) / (7 * DAY)) % interval === 0;
    else {
      const months = (d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + d.getUTCMonth() - anchor.getUTCMonth();
      const step = interval * (frequency === 'yearly' ? 12 : 1);
      hit = d.getUTCDate() === anchor.getUTCDate() && months % step === 0 && (frequency !== 'yearly' || d.getUTCMonth() === anchor.getUTCMonth());
    }
    if (hit) push(ms);
  }
  return out;
}
