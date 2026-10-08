// "This and following events": split one recurring series at a chosen occurrence.
// Pure planning only; components/admin/EventsPanel.jsx performs the saves.
import { rawOccurrences, validateEventSchedule } from './eventRecurrence.mjs';
import { slugify } from './eventForm.mjs';

const MAX_SCAN = 20000;
const samePattern = (a, b) => a.recurrence_frequency === b.recurrence_frequency
  && a.recurrence_interval === b.recurrence_interval
  && JSON.stringify(a.recurrence_weekdays || null) === JSON.stringify(b.recurrence_weekdays || null);

/** Position of an occurrence in the series' raw (exdate-ignoring) sequence, plus the one before it. */
export function locateOccurrence(event, occurrenceStart) {
  const { schedule, error } = validateEventSchedule(event);
  if (error) return null;
  const target = Date.parse(occurrenceStart);
  let previous = null;
  let index = 0;
  for (const ms of rawOccurrences(schedule, MAX_SCAN)) {
    if (ms === target) return { index, previousMs: previous, schedule };
    if (ms > target) return null;
    previous = ms;
    index += 1;
  }
  return null;
}

/** A fresh slug from the event name that does not collide with `taken`. */
export function newSeriesSlug(title, occurrenceStart, taken = [], random = Math.random) {
  const stamp = new Date(occurrenceStart).toISOString().slice(0, 10).replaceAll('-', '');
  const base = `${slugify(title).slice(0, 54)}-${stamp}`;
  const used = new Set(taken);
  let slug = base;
  while (used.has(slug)) slug = `${base}-${Math.floor(random() * 36 ** 3).toString(36).padStart(3, '0')}`;
  return slug.slice(0, 80);
}

/**
 * Fields that end `event` just before the occurrence at `index` (index >= 1).
 * Counted series keep exactly `index` occurrences; otherwise the stop date becomes the day of
 * the previous occurrence. Skipped dates from the cut onward are dropped.
 */
function endBefore(event, schedule, located, occurrenceStart) {
  const cut = Date.parse(occurrenceStart);
  const patch = {
    exdates: schedule.exdates.filter(iso => Date.parse(iso) < cut),
    series_id: event.series_id || event.slug,
  };
  if (schedule.recurrence_count) Object.assign(patch, { recurrence_count: located.index, recurrence_until: null });
  else Object.assign(patch, { recurrence_until: new Date(located.previousMs).toISOString().slice(0, 10), recurrence_count: null });
  return patch;
}

/**
 * Plan "this and following" for editing (`payload` = edited form payload) or deleting (`payload` null).
 * Returns { kind: 'all' } when the series should simply be replaced/removed (first occurrence, or
 * the occurrence cannot be located), otherwise { kind: 'split', original, next? }.
 */
export function planSplit(event, occurrenceStart, payload, { slug } = {}) {
  const located = locateOccurrence(event, occurrenceStart);
  if (!located || located.index === 0) return { kind: 'all' };
  const original = endBefore(event, located.schedule, located, occurrenceStart);
  if (!payload) return { kind: 'split', original };
  const cut = Date.parse(occurrenceStart);
  const shift = Date.parse(payload.starts_at) - cut;
  const unchanged = samePattern(located.schedule, validateEventSchedule(payload).schedule || {});
  const carried = unchanged
    ? located.schedule.exdates.filter(iso => Date.parse(iso) >= cut).map(iso => new Date(Date.parse(iso) + shift).toISOString())
    : [];
  const next = { ...payload, slug, series_id: original.series_id, exdates: carried };
  // The form still shows the original total: the new series gets what remained after the cut.
  if (located.schedule.recurrence_count && Number(payload.recurrence_count) === located.schedule.recurrence_count) {
    next.recurrence_count = located.schedule.recurrence_count - located.index;
    next.recurrence_until = null;
  }
  return { kind: 'split', original, next };
}
