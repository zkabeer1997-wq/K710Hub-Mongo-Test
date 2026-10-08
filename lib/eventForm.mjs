// Pure mapping between the admin event form (all times UTC) and the stored event shape.
import { MAX_COUNT, validateEventSchedule } from './eventRecurrence.mjs';

const MIN = 60000;
const DAY = 86400000;
export const DURATIONS = [
  ['none', 'No end time'], ['30', '30 minutes'], ['60', '1 hour'], ['90', '1.5 hours'], ['120', '2 hours'], ['180', '3 hours'],
  ['240', '4 hours'], ['480', '8 hours'], ['1440', '1 day'], ['custom', 'Custom end…'],
];
export const REPEATS = [
  ['none', 'Once only'], ['daily', 'Daily'], ['weekly', 'Weekly (choose days)'], ['nweeks', 'Every N weeks'],
  ['monthly', 'Monthly'], ['custom', 'Custom…'],
];
const pad = n => String(n).padStart(2, '0');
const dateOf = ms => new Date(ms).toISOString().slice(0, 10);
const timeOf = ms => new Date(ms).toISOString().slice(11, 16);

export function slugify(title) {
  const base = String(title || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'event';
}

export function emptyForm(startMs, endMs, allDay = false) {
  const start = Number.isFinite(startMs) ? startMs : Date.now();
  const minutes = Number.isFinite(endMs) ? Math.round((endMs - start) / MIN) : 60;
  const preset = DURATIONS.find(([value]) => value === String(minutes));
  return {
    title: '', slug: '', kind: 'custom', description: '', body_md: '', guide_slug: '', alliance_tags: [], published: true,
    all_day: allDay, start_date: dateOf(start), start_time: timeOf(start),
    duration: preset ? preset[0] : 'custom', end_date: dateOf(endMs || start + 60 * MIN), end_time: timeOf(endMs || start + 60 * MIN),
    repeat: 'none', interval: 1, unit: 'weekly', weekdays: [], stop: 'never', until: '', count: 10, series_id: '', exdates: [],
  };
}

export function formFromEvent(event) {
  const start = Date.parse(event.starts_at);
  const end = event.ends_at ? Date.parse(event.ends_at) : null;
  const freq = event.recurrence_frequency || 'none';
  const interval = Number(event.recurrence_interval) || 1;
  let repeat = 'custom';
  if (freq === 'none') repeat = 'none';
  else if (freq === 'daily' && interval === 1) repeat = 'daily';
  else if (freq === 'weekly') repeat = interval === 1 ? 'weekly' : 'nweeks';
  else if (freq === 'monthly' && interval === 1) repeat = 'monthly';
  const minutes = end === null ? null : Math.round((end - start) / MIN);
  const preset = minutes === null ? ['none'] : DURATIONS.find(([value]) => value === String(minutes));
  const allDay = Boolean(event.all_day);
  return {
    title: event.title || '', slug: event.slug || '', kind: event.kind || 'custom', description: event.description || '', body_md: event.body_md || '',
    guide_slug: event.guide_slug || '', alliance_tags: Array.isArray(event.alliance_tags) ? [...event.alliance_tags] : [], published: event.published !== false,
    all_day: allDay, start_date: dateOf(start), start_time: timeOf(start),
    duration: preset ? preset[0] : 'custom',
    end_date: end === null ? dateOf(start) : dateOf(allDay ? end - DAY : end), end_time: end === null ? timeOf(start) : timeOf(end),
    repeat, interval, unit: freq === 'none' ? 'weekly' : freq, weekdays: Array.isArray(event.recurrence_weekdays) ? [...event.recurrence_weekdays] : [],
    stop: event.recurrence_count ? 'count' : event.recurrence_until ? 'date' : 'never', until: event.recurrence_until || '', count: event.recurrence_count || 10, series_id: event.series_id || '', exdates: Array.isArray(event.exdates) ? [...event.exdates] : [],
  };
}

// Returns { payload } for the API, or { error }.
export function eventFromForm(form) {
  const start = Date.parse(`${form.start_date}T${form.all_day ? '00:00' : form.start_time || '00:00'}:00.000Z`);
  if (!Number.isFinite(start)) return { error: 'Choose a start date and time.' };
  let end = null;
  if (form.all_day) {
    const last = Date.parse(`${form.end_date || form.start_date}T00:00:00.000Z`);
    if (!Number.isFinite(last) || last < Date.parse(`${form.start_date}T00:00:00.000Z`)) return { error: 'The end date cannot be before the start date.' };
    end = last + DAY;
  } else if (form.duration === 'custom') {
    end = Date.parse(`${form.end_date}T${form.end_time}:00.000Z`);
    if (!Number.isFinite(end)) return { error: 'Choose an end date and time.' };
  } else if (form.duration !== 'none') end = start + Number(form.duration) * MIN;

  const interval = Math.max(1, Number(form.interval) || 1);
  let recurrence_frequency = 'none';
  let recurrence_interval = 1;
  let recurrence_weekdays = null;
  if (form.repeat === 'daily') recurrence_frequency = 'daily';
  else if (form.repeat === 'weekly' || form.repeat === 'nweeks') {
    recurrence_frequency = 'weekly';
    recurrence_interval = form.repeat === 'nweeks' ? interval : 1;
    const days = form.weekdays?.length ? form.weekdays : [new Date(start).getUTCDay()];
    recurrence_weekdays = [...new Set(days)].sort((a, b) => a - b);
  } else if (form.repeat === 'monthly') recurrence_frequency = 'monthly';
  else if (form.repeat === 'custom') {
    recurrence_frequency = form.unit;
    recurrence_interval = interval;
    if (form.unit === 'weekly' && form.weekdays?.length) recurrence_weekdays = [...form.weekdays].sort((a, b) => a - b);
  }
  // A weekly series should start on one of its own weekdays.
  let startMs = start;
  let endMs = end;
  if (recurrence_weekdays && !recurrence_weekdays.includes(new Date(start).getUTCDay())) {
    let ahead = 1;
    while (!recurrence_weekdays.includes(new Date(start + ahead * DAY).getUTCDay())) ahead += 1;
    startMs = start + ahead * DAY;
    endMs = end === null ? null : end + ahead * DAY;
  }
  // Stop condition: never / on a date / after N occurrences (mutually exclusive).
  const stop = form.stop || (form.until ? 'date' : 'never');
  let recurrence_count = null;
  if (recurrence_frequency !== 'none' && stop === 'count') {
    const n = typeof form.count === 'string' && form.count.trim() === '' ? NaN : Number(form.count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) return { error: 'Number of occurrences must be a whole number from 1 to 500.' };
    recurrence_count = n;
  }
  const payload = {
    title: String(form.title || '').trim(), slug: form.slug, kind: form.kind, description: form.description, body_md: form.body_md,
    guide_slug: form.guide_slug || null, alliance_tags: form.alliance_tags, published: Boolean(form.published), all_day: Boolean(form.all_day),
    starts_at: new Date(startMs).toISOString(), ends_at: endMs === null ? null : new Date(endMs).toISOString(),
    recurrence_frequency, recurrence_interval, recurrence_weekdays,
    recurrence_until: recurrence_frequency === 'none' || stop !== 'date' ? null : form.until || null, recurrence_count, exdates: form.exdates || [],
  };
  if (form.series_id) payload.series_id = form.series_id;
  if (!payload.title) return { error: 'Give the event a name.' };
  const { error } = validateEventSchedule(payload);
  return error ? { error } : { payload };
}

// Skipping one occurrence of a series: add its start instant to exdates.
export function withExdate(event, occurrenceStart) {
  return [...new Set([...(event.exdates || []), new Date(occurrenceStart).toISOString()])].sort();
}

// "This event only" edit: the series skips that date and a one-off copy carries the change.
export function singleOccurrenceCopy(payload, occurrenceStart) {
  const stamp = new Date(occurrenceStart).toISOString().slice(0, 10).replaceAll('-', '');
  return {
    ...payload, slug: `${String(payload.slug).slice(0, 66)}-${stamp}`.slice(0, 80),
    recurrence_frequency: 'none', recurrence_interval: 1, recurrence_weekdays: null, recurrence_until: null, recurrence_count: null, exdates: [],
  };
}

export const hhmm = (h, m) => `${pad(h)}:${pad(m)}`;

// "All events" edit made while looking at a later occurrence: move the series anchor by the same shift.
export function shiftSeries(payload, seriesStartMs, shiftMs) {
  const duration = payload.ends_at ? Date.parse(payload.ends_at) - Date.parse(payload.starts_at) : null;
  const start = seriesStartMs + shiftMs;
  return { ...payload, starts_at: new Date(start).toISOString(), ends_at: duration === null ? null : new Date(start + duration).toISOString() };
}

// Weekly repeat days are UTC weekdays. Describe the chosen start in the viewer's zone so the
// admin can see when the two differ. `timeZone` is injectable for tests.
export function weekdayZoneNote(startIso, { locale, timeZone } = {}) {
  const ms = Date.parse(startIso);
  if (!Number.isFinite(ms)) return null;
  const long = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(ms);
  let localDay;
  let localTime;
  try {
    localDay = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(ms);
    localTime = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(ms);
  } catch { return null; }
  const utcTime = new Date(ms).toISOString().slice(11, 16);
  const differs = localDay !== long;
  return {
    utcDay: long, utcTime, localDay, localTime, differs,
    text: `${long} ${utcTime} UTC = ${localDay} ${localTime} your time`,
    hint: differs ? `In UTC this is ${long}. Repeat days follow the UTC weekday, not your local one.` : '',
  };
}
