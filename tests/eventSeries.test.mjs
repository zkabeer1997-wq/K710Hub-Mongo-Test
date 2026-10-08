import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandOccurrences, nextEventOccurrence, recurrenceLabel, recurrenceRule, upcomingEventSeries, validateEventSchedule } from '../lib/eventRecurrence.mjs';
import { planSplit, newSeriesSlug, locateOccurrence } from '../lib/eventSeries.mjs';
import { emptyForm, eventFromForm, formFromEvent, weekdayZoneNote } from '../lib/eventForm.mjs';
import { buildIcsCalendar } from '../lib/ics.js';

const DAY = 86400000;
const weekly = { slug: 'qa-test', title: 'QA', kind: 'custom', starts_at: '2030-01-03T20:00:00.000Z', ends_at: '2030-01-03T21:00:00.000Z', recurrence_frequency: 'weekly', recurrence_interval: 1, recurrence_weekdays: [4], recurrence_count: 6, recurrence_until: null, exdates: [] };
const all = (event) => expandOccurrences(event, Date.parse('2029-01-01'), Date.parse('2032-01-01'), 2000).map(o => o.starts_at);
const sched = (event) => validateEventSchedule(event).schedule;

test('count limits a weekly series and validates 1-500 integers', () => {
  assert.equal(all(weekly).length, 6);
  assert.equal(all(weekly)[5], '2030-02-07T20:00:00.000Z');
  for (const bad of [0, 501, 2.5, 'abc', -1]) assert.ok(validateEventSchedule({ ...weekly, recurrence_count: bad }).error, String(bad));
  assert.equal(validateEventSchedule({ ...weekly, recurrence_count: 500 }).schedule.recurrence_count, 500);
  assert.equal(validateEventSchedule({ ...weekly, recurrence_count: '3' }).schedule.recurrence_count, 3);
});
test('count and stop date are mutually exclusive; count is cleared when not repeating', () => {
  assert.ok(validateEventSchedule({ ...weekly, recurrence_until: '2030-06-01' }).error);
  assert.equal(validateEventSchedule({ ...weekly, recurrence_frequency: 'none' }).schedule.recurrence_count, null);
});
test('excluded occurrences still count toward the total', () => {
  const event = { ...weekly, exdates: ['2030-01-17T20:00:00.000Z'] };
  const dates = all(event);
  assert.equal(dates.length, 5);
  assert.ok(!dates.includes('2030-01-17T20:00:00.000Z'));
  assert.equal(dates.at(-1), '2030-02-07T20:00:00.000Z');
});
test('weekly multi-day count counts occurrences, not weeks', () => {
  const event = { ...weekly, recurrence_weekdays: [1, 4], starts_at: '2030-01-03T20:00:00.000Z', ends_at: null, recurrence_count: 5 };
  assert.deepEqual(all(event), ['2030-01-03', '2030-01-07', '2030-01-10', '2030-01-14', '2030-01-17'].map(d => `${d}T20:00:00.000Z`));
});
test('monthly, daily and interval series honour count', () => {
  const monthly = { ...weekly, recurrence_frequency: 'monthly', recurrence_weekdays: null, starts_at: '2030-01-31T20:00:00.000Z', ends_at: null, recurrence_count: 3 };
  assert.deepEqual(all(monthly), ['2030-01-31', '2030-03-31', '2030-05-31'].map(d => `${d}T20:00:00.000Z`));
  const daily = { ...weekly, recurrence_frequency: 'daily', recurrence_weekdays: null, recurrence_count: 4 };
  assert.equal(all(daily).length, 4);
  assert.equal(all({ ...weekly, recurrence_interval: 2, recurrence_count: 3 }).at(-1), '2030-01-31T20:00:00.000Z');
});
test('next occurrence respects count and exdates; series expires after the last one', () => {
  const event = { ...weekly, exdates: ['2030-01-10T20:00:00.000Z'] };
  assert.equal(nextEventOccurrence(event, Date.parse('2030-01-04T00:00:00Z')).starts_at, '2030-01-17T20:00:00.000Z');
  assert.equal(nextEventOccurrence(event, Date.parse('2030-02-07T21:00:00Z')), null);
  assert.equal(nextEventOccurrence(event, Date.parse('2030-02-07T20:30:00Z')).starts_at, '2030-02-07T20:00:00.000Z');
  assert.equal(upcomingEventSeries([event], Date.parse('2030-03-01')).length, 0);
});
test('ICS carries COUNT and EXDATE', () => {
  assert.match(recurrenceRule(weekly), /FREQ=WEEKLY;INTERVAL=1;BYDAY=TH;COUNT=6$/);
  const ics = buildIcsCalendar({ name: 'x', events: [{ uid: 'a', start: new Date(weekly.starts_at), end: null, summary: 'QA', rrule: recurrenceRule(weekly), exdates: ['2030-01-17T20:00:00.000Z'] }] });
  assert.match(ics, /RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TH;COUNT=6/);
  assert.match(ics, /EXDATE:20300117T200000Z/);
});
test('recurrence label shows count and stop date', () => {
  assert.equal(recurrenceLabel({ ...weekly, recurrence_count: 10 }, Date.parse('2030-05-01')), 'Weekly on Thu, 10 times');
  assert.equal(recurrenceLabel({ ...weekly, recurrence_count: null, recurrence_until: '2030-11-20' }, Date.parse('2030-05-01')), 'Weekly on Thu until Nov 20');
  assert.equal(recurrenceLabel({ ...weekly, recurrence_count: null }), 'Weekly on Thu');
});

// ---- form mapping ----
test('form maps stop conditions and rejects bad counts', () => {
  const form = { ...emptyForm(Date.parse('2030-01-03T20:00:00Z'), Date.parse('2030-01-03T21:00:00Z')), title: 'QA', repeat: 'weekly', stop: 'count', count: '6', until: '2030-09-09' };
  const { payload } = eventFromForm(form);
  assert.equal(payload.recurrence_count, 6);
  assert.equal(payload.recurrence_until, null);
  assert.equal(eventFromForm({ ...form, stop: 'date' }).payload.recurrence_until, '2030-09-09');
  assert.equal(eventFromForm({ ...form, stop: 'date' }).payload.recurrence_count, null);
  assert.equal(eventFromForm({ ...form, stop: 'never' }).payload.recurrence_until, null);
  for (const count of ['0', '501', '2.5', '', 'x']) assert.ok(eventFromForm({ ...form, count }).error, count);
  assert.equal(formFromEvent(payload).stop, 'count');
  assert.equal(formFromEvent({ ...payload, recurrence_count: null, recurrence_until: '2030-09-09' }).stop, 'date');
});

// ---- split ----
const total = (events) => events.flatMap(all).sort();
test('split in the middle: counted series adds up to the original total', () => {
  const occ = '2030-01-17T20:00:00.000Z'; // 3rd occurrence
  const edited = { ...weekly, title: 'QA two', starts_at: '2030-01-17T18:00:00.000Z', ends_at: '2030-01-17T19:00:00.000Z' };
  const plan = planSplit(weekly, occ, edited, { slug: 'qa-two' });
  assert.equal(plan.kind, 'split');
  const first = { ...weekly, ...plan.original };
  assert.equal(first.recurrence_count, 2);
  assert.equal(plan.next.recurrence_count, 4);
  assert.equal(plan.next.series_id, 'qa-test');
  assert.equal(plan.original.series_id, 'qa-test');
  const dates = total([first, plan.next]);
  assert.equal(dates.length, 6);
  assert.equal(new Set(dates).size, 6); // no duplicates
  assert.deepEqual(all(first), ['2030-01-03T20:00:00.000Z', '2030-01-10T20:00:00.000Z']);
  assert.equal(all(plan.next)[0], '2030-01-17T18:00:00.000Z'); // shifted start
});
test('split of an open-ended series ends the original the day of the previous occurrence', () => {
  const open = { ...weekly, recurrence_count: null };
  const plan = planSplit(open, '2030-01-24T20:00:00.000Z', { ...open, title: 'N' }, { slug: 'n' });
  assert.equal(plan.original.recurrence_until, '2030-01-17');
  assert.equal(plan.original.recurrence_count, null);
  assert.equal(all({ ...open, ...plan.original }).length, 3);
  assert.equal(plan.next.recurrence_until, null);
});
test('first occurrence is the same as all events; unknown occurrence cannot split', () => {
  assert.equal(planSplit(weekly, weekly.starts_at, weekly, { slug: 'x' }).kind, 'all');
  assert.equal(planSplit(weekly, '2030-01-04T20:00:00.000Z', weekly, { slug: 'x' }).kind, 'all');
  assert.equal(locateOccurrence(weekly, '2030-01-04T20:00:00.000Z'), null);
});
test('last occurrence splits into a one-time new series', () => {
  const plan = planSplit(weekly, '2030-02-07T20:00:00.000Z', weekly, { slug: 'last' });
  assert.equal(plan.original.recurrence_count, 5);
  assert.equal(plan.next.recurrence_count, 1);
  assert.equal(all(plan.next).length, 1);
});
test('skipped dates before the cut stay, from the cut on move to the new series (shifted)', () => {
  const event = { ...weekly, recurrence_count: 8, exdates: ['2030-01-10T20:00:00.000Z', '2030-01-31T20:00:00.000Z'] };
  const edited = { ...event, starts_at: '2030-01-24T19:00:00.000Z', ends_at: '2030-01-24T20:00:00.000Z' };
  const plan = planSplit(event, '2030-01-24T20:00:00.000Z', edited, { slug: 's' });
  assert.deepEqual(plan.original.exdates, ['2030-01-10T20:00:00.000Z']);
  assert.deepEqual(plan.next.exdates, ['2030-01-31T19:00:00.000Z']);
  const first = { ...event, ...plan.original };
  assert.equal(all(first).length + all(plan.next).length, 8 - 2); // two skipped dates, both still counted
  assert.equal(new Set(total([first, plan.next])).size, 6);
});
test('changing the count in the form is respected as-is for the new series', () => {
  const plan = planSplit(weekly, '2030-01-17T20:00:00.000Z', { ...weekly, recurrence_count: 3 }, { slug: 'c' });
  assert.equal(plan.next.recurrence_count, 3);
});
test('delete this and following ends the original and drops later skipped dates', () => {
  const event = { ...weekly, exdates: ['2030-01-10T20:00:00.000Z', '2030-01-31T20:00:00.000Z'] };
  const plan = planSplit(event, '2030-01-24T20:00:00.000Z', null);
  assert.equal(plan.kind, 'split');
  assert.equal(plan.next, undefined);
  assert.deepEqual(plan.original.exdates, ['2030-01-10T20:00:00.000Z']);
  assert.equal(all({ ...event, ...plan.original }).length, 3 - 1);
});
test('a stored one-off edit stays untouched and unique after a split', () => {
  const series = { ...weekly, exdates: ['2030-01-24T20:00:00.000Z'] };
  const oneOff = { ...weekly, slug: 'qa-test-20300124', recurrence_frequency: 'none', recurrence_count: null, recurrence_weekdays: null, starts_at: '2030-01-24T22:00:00.000Z', ends_at: null, exdates: [] };
  const plan = planSplit(series, '2030-01-31T20:00:00.000Z', { ...series, starts_at: '2030-01-31T20:00:00.000Z', ends_at: '2030-01-31T21:00:00.000Z' }, { slug: 'n' });
  const rows = [{ ...series, ...plan.original }, plan.next, oneOff];
  const dates = total(rows);
  assert.equal(new Set(dates).size, dates.length);
  assert.ok(dates.includes('2030-01-24T22:00:00.000Z'));
});
test('split works on a built-in style event (no ids, no extras) and interval series', () => {
  const builtIn = { slug: 'kvk-cycle', title: 'KvK', starts_at: '2026-09-07T00:00:00.000Z', ends_at: '2026-09-11T00:00:00.000Z', recurrence_frequency: 'weekly', recurrence_interval: 4 };
  const occ = '2026-11-30T00:00:00.000Z';
  const plan = planSplit(builtIn, occ, { ...builtIn, title: 'KvK 2' }, { slug: 'kvk-2' });
  assert.equal(plan.original.series_id, 'kvk-cycle');
  assert.equal(plan.original.recurrence_until, '2026-11-02');
  assert.equal(plan.next.starts_at, builtIn.starts_at); // payload start is what the form chose
});
test('ticker ordering uses the new series after the cut with no duplicate next date', () => {
  const plan = planSplit(weekly, '2030-01-17T20:00:00.000Z', { ...weekly, title: 'QA two' }, { slug: 'qa-two' });
  const rows = [{ ...weekly, ...plan.original }, plan.next];
  const now = Date.parse('2030-01-11T00:00:00Z');
  const upcoming = upcomingEventSeries(rows, now);
  assert.deepEqual(upcoming.map(r => r.event.slug), ['qa-two']);
  assert.equal(upcoming[0].occurrence.starts_at, '2030-01-17T20:00:00.000Z');
  assert.equal(upcomingEventSeries(rows, Date.parse('2030-01-05')).map(r => r.event.slug)[0], 'qa-test');
});
test('new series slug comes from the name and avoids collisions', () => {
  assert.equal(newSeriesSlug('Strongest Governor!', '2030-01-17T20:00:00Z', []), 'strongest-governor-20300117');
  const slug = newSeriesSlug('Strongest Governor!', '2030-01-17T20:00:00Z', ['strongest-governor-20300117'], () => 0.5);
  assert.notEqual(slug, 'strongest-governor-20300117');
  assert.match(slug, /^[a-z0-9-]{1,80}$/);
});

// ---- UTC weekday hint ----
test('weekday note shows the local equivalent and flags a differing weekday', () => {
  const same = weekdayZoneNote('2030-01-03T20:00:00.000Z', { locale: 'en-US', timeZone: 'America/New_York' });
  assert.equal(same.text, 'Thursday 20:00 UTC = Thursday 3:00 PM your time');
  assert.equal(same.differs, false);
  const diff = weekdayZoneNote('2030-01-04T02:00:00.000Z', { locale: 'en-US', timeZone: 'America/New_York' });
  assert.equal(diff.differs, true);
  assert.match(diff.hint, /In UTC this is Friday/);
  assert.equal(weekdayZoneNote('bad'), null);
});
