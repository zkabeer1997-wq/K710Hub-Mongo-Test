import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandOccurrences, nextEventOccurrence, recurrenceLabel, recurrenceRule, upcomingEventSeries, validateEventSchedule } from '../lib/eventRecurrence.mjs';
import { occurrencesInRange, viewDays, shiftAnchor, describeOccurrence, isAllDay, occurrencesOnDay } from '../lib/eventCalendar.mjs';
import { eventHref, validateEventExtras, eventAllianceLabel } from '../lib/eventFields.mjs';
import { eventFromForm, formFromEvent, emptyForm, singleOccurrenceCopy, shiftSeries, withExdate } from '../lib/eventForm.mjs';
import { mergeDefaultEvents } from '../lib/defaultEvents.mjs';

const T = iso => Date.parse(iso);
const weekly = { slug: 'sg', title: 'Strongest Governor', kind: 'custom', starts_at: '2026-10-01T20:00:00.000Z', ends_at: '2026-10-01T22:00:00.000Z', recurrence_frequency: 'weekly', recurrence_interval: 1 };
const starts = list => list.map(o => o.starts_at.slice(0, 16));

test('weekly series expands each week at the same UTC time', () => {
  assert.deepEqual(starts(expandOccurrences(weekly, T('2026-10-01T00:00:00Z'), T('2026-10-23T00:00:00Z'))), ['2026-10-01T20:00', '2026-10-08T20:00', '2026-10-15T20:00', '2026-10-22T20:00']);
});
test('weekday lists pick several days per week and honour an every-N-weeks interval', () => {
  const mwf = { ...weekly, starts_at: '2026-10-05T10:00:00.000Z', ends_at: null, recurrence_weekdays: [1, 3, 5] };
  assert.deepEqual(starts(expandOccurrences(mwf, T('2026-10-05T00:00:00Z'), T('2026-10-12T00:00:00Z'))), ['2026-10-05T10:00', '2026-10-07T10:00', '2026-10-09T10:00']);
  const biweekly = { ...mwf, recurrence_interval: 2 };
  assert.deepEqual(starts(expandOccurrences(biweekly, T('2026-10-05T00:00:00Z'), T('2026-10-26T00:00:00Z'))), ['2026-10-05T10:00', '2026-10-07T10:00', '2026-10-09T10:00', '2026-10-19T10:00', '2026-10-21T10:00', '2026-10-23T10:00']);
});
test('exdates remove single occurrences and nextEventOccurrence skips them', () => {
  const skipped = { ...weekly, exdates: ['2026-10-08T20:00:00.000Z'] };
  assert.deepEqual(starts(expandOccurrences(skipped, T('2026-10-01T00:00:00Z'), T('2026-10-16T00:00:00Z'))), ['2026-10-01T20:00', '2026-10-15T20:00']);
  assert.equal(nextEventOccurrence(skipped, T('2026-10-02T00:00:00Z')).starts_at, '2026-10-15T20:00:00.000Z');
  const withDays = { ...weekly, recurrence_weekdays: [4], exdates: ['2026-10-08T20:00:00.000Z'] };
  assert.equal(nextEventOccurrence(withDays, T('2026-10-02T00:00:00Z')).starts_at, '2026-10-15T20:00:00.000Z');
});
test('monthly skips missing dates and respects the stop date', () => {
  const monthly = { ...weekly, starts_at: '2026-01-31T08:00:00.000Z', ends_at: null, recurrence_frequency: 'monthly', recurrence_until: '2026-05-31' };
  assert.deepEqual(starts(expandOccurrences(monthly, T('2026-01-01T00:00:00Z'), T('2026-12-31T00:00:00Z'))), ['2026-01-31T08:00', '2026-03-31T08:00', '2026-05-31T08:00']);
});
test('expansion agrees with nextEventOccurrence for classic series', () => {
  for (const event of [weekly, { ...weekly, recurrence_interval: 2 }, { ...weekly, recurrence_frequency: 'daily' }]) {
    const now = T('2026-10-20T21:00:00Z');
    assert.equal(expandOccurrences(event, now, now + 40 * 86400000).find(o => T(o.ends_at) > now).starts_at, nextEventOccurrence(event, now).starts_at);
  }
});
test('events that overlap the window start are included and a one-off appears once', () => {
  const once = { ...weekly, recurrence_frequency: 'none' };
  assert.equal(expandOccurrences(once, T('2026-10-01T21:00:00Z'), T('2026-10-02T00:00:00Z')).length, 1);
  assert.equal(expandOccurrences(once, T('2026-10-01T22:00:01Z'), T('2026-10-03T00:00:00Z')).length, 0);
});
test('schedule validation normalises weekdays and exdates and rejects bad input', () => {
  const ok = validateEventSchedule({ ...weekly, recurrence_weekdays: [5, 1, 1], exdates: ['2026-10-08T20:00:00Z'], all_day: 1 }).schedule;
  assert.deepEqual(ok.recurrence_weekdays, [1, 5]);
  assert.deepEqual(ok.exdates, ['2026-10-08T20:00:00.000Z']);
  assert.equal(ok.all_day, true);
  assert.ok(validateEventSchedule({ ...weekly, recurrence_weekdays: [7] }).error);
  assert.ok(validateEventSchedule({ ...weekly, exdates: ['nope'] }).error);
  assert.equal(validateEventSchedule({ ...weekly, recurrence_frequency: 'daily', recurrence_weekdays: [1] }).schedule.recurrence_weekdays, null);
  assert.equal(validateEventSchedule({ starts_at: weekly.starts_at }).schedule.exdates.length, 0); // legacy rows still validate
});
test('labels and RRULE mention weekdays', () => {
  const event = { ...weekly, recurrence_weekdays: [1, 4] };
  assert.equal(recurrenceLabel(event), 'Weekly on Mon, Thu');
  assert.match(recurrenceRule(event), /FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH/);
});
test('occurrences across events are ordered by start time', () => {
  const other = { ...weekly, slug: 'b', title: 'Alpha', starts_at: '2026-10-01T09:00:00.000Z', ends_at: null };
  const list = occurrencesInRange([weekly, other], T('2026-10-01T00:00:00Z'), T('2026-10-09T00:00:00Z'));
  assert.deepEqual(list.map(o => `${o.event.slug}@${o.starts_at.slice(5, 13)}`), ['b@10-01T09', 'sg@10-01T20', 'b@10-08T09', 'sg@10-08T20']);
});
test('calendar view ranges: month is 6 weeks from Sunday, week is 7 days, navigation moves by view', () => {
  const month = viewDays('month', T('2026-10-08T12:00:00Z'), true);
  assert.equal(month.days.length, 42);
  assert.equal(month.days[0].key, '2026-09-27');
  assert.equal(viewDays('week', T('2026-10-08T12:00:00Z'), true).days[0].key, '2026-10-04');
  assert.equal(viewDays('day', shiftAnchor('day', T('2026-10-08T12:00:00Z'), 1, true), true).days[0].key, '2026-10-09');
  assert.equal(viewDays('month', shiftAnchor('month', T('2026-10-08T12:00:00Z'), 1, true), true).days[0].key, '2026-11-01');
});
test('multi-day events count as all-day and appear on every day they cover', () => {
  const kvk = { ...weekly, starts_at: '2026-10-05T00:00:00.000Z', ends_at: '2026-10-09T00:00:00.000Z', recurrence_frequency: 'none' };
  const view = viewDays('week', T('2026-10-07T12:00:00Z'), true);
  const items = occurrencesInRange([kvk], view.from, view.to);
  assert.equal(isAllDay(items[0]), true);
  assert.deepEqual(view.days.filter(d => occurrencesOnDay(items, d).length).map(d => d.key), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
});
test('screen reader label includes name, date, UTC time and repeat pattern', () => {
  const [occ] = occurrencesInRange([weekly], T('2026-10-08T00:00:00Z'), T('2026-10-09T00:00:00Z'));
  assert.equal(describeOccurrence(occ, true), 'Strongest Governor, Thursday Oct 8, 20:00 UTC, repeats weekly');
});
test('guide link resolution prefers the guide slug and falls back to the event page', () => {
  assert.equal(eventHref({ slug: 'strongest-governor', guide_slug: 'strongest-governor-guide' }), '/guides/strongest-governor-guide');
  assert.equal(eventHref({ slug: 'strongest-governor', guide_slug: null }), '/events/strongest-governor');
  assert.equal(eventHref({ slug: 'x', guide_slug: '../evil' }), '/events/x');
});
test('extras validation: guide slug, alliances, defaults', () => {
  assert.deepEqual(validateEventExtras({}, { withDefaults: true }).fields, { guide_slug: null, alliance_tags: [] });
  assert.deepEqual(validateEventExtras({ alliance_tags: ['red', 'SKY', 'red'], guide_slug: ' my-guide ' }).fields, { alliance_tags: ['RED', 'SKY'], guide_slug: 'my-guide' });
  assert.deepEqual(validateEventExtras({}).fields, {});
  assert.ok(validateEventExtras({ guide_slug: 'Bad Slug!' }).error);
  assert.ok(validateEventExtras({ alliance_tags: ['<x>'] }).error);
  assert.equal(eventAllianceLabel({ alliance_tags: ['710', 'RED'] }), '710 / RED');
  assert.equal(eventAllianceLabel({}), 'All alliances');
});
test('form maps to the stored shape: weekly weekdays, all-day, duration, N weeks', () => {
  const form = { ...emptyForm(T('2026-10-14T12:00:00Z'), T('2026-10-14T13:00:00Z')), title: ' Strongest Governor ', slug: 'sg', repeat: 'weekly', weekdays: [4], start_time: '20:00', duration: '120' };
  const { payload } = eventFromForm(form);
  assert.equal(payload.title, 'Strongest Governor');
  assert.equal(payload.starts_at, '2026-10-15T20:00:00.000Z'); // moved to the first chosen weekday
  assert.equal(payload.ends_at, '2026-10-15T22:00:00.000Z');
  assert.deepEqual(payload.recurrence_weekdays, [4]);
  const allDay = eventFromForm({ ...form, repeat: 'none', all_day: true, end_date: '2026-10-16' }).payload;
  assert.equal(allDay.starts_at, '2026-10-14T00:00:00.000Z');
  assert.equal(allDay.ends_at, '2026-10-17T00:00:00.000Z');
  const nweeks = eventFromForm({ ...form, repeat: 'nweeks', interval: 3 }).payload;
  assert.equal(nweeks.recurrence_interval, 3);
  assert.ok(eventFromForm({ ...form, title: '  ' }).error);
  const back = formFromEvent(payload);
  assert.equal(back.repeat, 'weekly');
  assert.equal(back.duration, '120');
});
test('single-occurrence helpers: exdate list, one-off copy and series shift', () => {
  assert.deepEqual(withExdate({ exdates: ['2026-10-01T20:00:00.000Z'] }, '2026-10-08T20:00:00Z'), ['2026-10-01T20:00:00.000Z', '2026-10-08T20:00:00.000Z']);
  const copy = singleOccurrenceCopy({ ...weekly, recurrence_weekdays: [4], exdates: ['x'] }, '2026-10-15T20:00:00Z');
  assert.equal(copy.slug, 'sg-20261015');
  assert.equal(copy.recurrence_frequency, 'none');
  assert.deepEqual(copy.exdates, []);
  const shifted = shiftSeries(weekly, T(weekly.starts_at), 3600000);
  assert.equal(shifted.starts_at, '2026-10-01T21:00:00.000Z');
  assert.equal(shifted.ends_at, '2026-10-01T23:00:00.000Z');
});
test('a stored event overrides a built-in default with the same slug (no duplicates); drafts hide it', () => {
  const merged = mergeDefaultEvents([{ slug: 'swordland-showdown', title: 'My Swordland', published: true }], []);
  assert.equal(merged.filter(e => e.slug === 'swordland-showdown').length, 1);
  assert.equal(merged.find(e => e.slug === 'swordland-showdown').title, 'My Swordland');
  const upcoming = upcomingEventSeries(mergeDefaultEvents([], []).filter(e => e.published), T('2026-10-08T00:00:00Z'));
  assert.ok(upcoming.length >= 3);
});
