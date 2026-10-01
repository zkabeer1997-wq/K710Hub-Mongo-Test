import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextBearTime } from '../lib/bearHuntSchedule.js';
import { allianceFacts } from '../lib/allianceFacts.mjs';
import { stripLegacyBearCopy } from '../lib/bearCopy.mjs';
import { defaultEvents, mergeDefaultEvents, findDefaultEvent } from '../lib/defaultEvents.mjs';
import { nextEventOccurrence, recurrenceRule, validateEventSchedule } from '../lib/eventRecurrence.mjs';
import { bearHuntIcsEvents } from '../lib/bearIcs.mjs';
import { buildIcsCalendar, foldLine } from '../lib/ics.js';

const at = iso => Date.parse(iso);

test('nextBearTime picks the next UTC time and wraps past the last one', () => {
  const times = ['19:00', '01:00', '13:00'];
  assert.equal(nextBearTime(times, at('2026-10-01T00:30:00Z')), '01:00');
  assert.equal(nextBearTime(times, at('2026-10-01T01:01:00Z')), '13:00');
  assert.equal(nextBearTime(times, at('2026-10-01T13:00:30Z')), '13:00');
  assert.equal(nextBearTime(times, at('2026-10-01T19:01:00Z')), '01:00');
  assert.equal(nextBearTime([], at('2026-10-01T00:00:00Z')), null);
  assert.equal(nextBearTime(['bad'], at('2026-10-01T00:00:00Z')), null);
});

test('allianceFacts omits empty fields', () => {
  assert.deepEqual(allianceFacts({ timezone_focus: '  ', roster_size: null, language: '' }), []);
  const facts = allianceFacts({ timezone_focus: 'EU evening', roster_size: 85, language: 'English', leader_player_id: '' });
  assert.deepEqual(facts.map(f => f.key), ['timezone_focus', 'roster_size', 'language']);
  assert.equal(facts[1].value, '85 members');
});

test('stripLegacyBearCopy drops "Bear:" lines but keeps the rest', () => {
  assert.equal(stripLegacyBearCopy('Main alliance\nBear: 01:00 UTC, 13:00 UTC'), 'Main alliance');
  assert.equal(stripLegacyBearCopy('Bear hunts - 01:00 UTC'), '');
  assert.equal(stripLegacyBearCopy('We love bears.'), 'We love bears.');
});

const alliances = [{ tag: '710', name: '710', bear_times_utc: ['01:00', '13:00'] }, { tag: 'RED', name: 'RED', bear_times_utc: ['02:00'] }];

test('default events are seeded without a DB write and include bear hunts, KvK, Swordland, Flamedragon', () => {
  const events = defaultEvents(alliances);
  const slugs = events.map(e => e.slug);
  assert.ok(slugs.includes('bear-hunt-710-0100') && slugs.includes('bear-hunt-710-1300') && slugs.includes('bear-hunt-red-0200'));
  for (const slug of ['kvk-cycle', 'swordland-showdown', 'flamedragon-tyrant']) assert.ok(slugs.includes(slug));
  for (const event of events) {
    assert.ok(validateEventSchedule(event).schedule, event.slug);
    assert.ok(nextEventOccurrence(event, at('2026-10-01T00:00:00Z')), event.slug);
    assert.ok(recurrenceRule(event).startsWith('FREQ='));
  }
  assert.equal(nextEventOccurrence(events[0], at('2026-10-01T00:30:00Z')).starts_at, '2026-10-01T01:00:00.000Z');
});

test('a stored event with the same slug overrides (or hides) the default', () => {
  const stored = [{ slug: 'kvk-cycle', title: 'KvK custom', published: false, starts_at: '2026-10-05T00:00:00Z' }];
  const merged = mergeDefaultEvents(stored, alliances);
  assert.equal(merged.filter(e => e.slug === 'kvk-cycle').length, 1);
  assert.equal(merged.find(e => e.slug === 'kvk-cycle').title, 'KvK custom');
  assert.equal(findDefaultEvent('nope', alliances), null);
});

test('bear hunt ICS is valid: CRLF, balanced, RRULE, per-alliance filter, folded at 75 octets', () => {
  const now = at('2026-10-01T05:00:00Z');
  const events = bearHuntIcsEvents(alliances, { tag: 'red', now });
  assert.equal(events.length, 1);
  assert.equal(events[0].start.toISOString(), '2026-10-02T02:00:00.000Z');
  const ics = buildIcsCalendar({ name: 'K710 RED Bear Hunt Schedule', events });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 1);
  assert.match(ics, /RRULE:FREQ=DAILY\r\n/);
  assert.match(ics, /DTSTART:20261002T020000Z\r\n/);
  assert.match(ics, /UID:bear-hunt-RED-0200@k710hub\r\n/);
  assert.doesNotMatch(ics.replace(/\r\n/g, ''), /\n|\r/);
  assert.equal(bearHuntIcsEvents(alliances, { now }).length, 3);
});

test('ICS lines fold at 75 octets without splitting multi-byte characters', () => {
  const long = `DESCRIPTION:${'Bear Hunt — · '.repeat(20)}`;
  const folded = foldLine(long);
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), long);
});
