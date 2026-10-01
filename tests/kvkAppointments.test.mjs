import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HOUR_OPTIONS, SLOT_OPTIONS, generateTimeOptions, contributionScore, CONTRIBUTION_WEIGHTS, validateApplication,
  allocateSlots, hasNoDoubleBooking, myAppointmentRows, slotRange, localTimeLabel, buildSchedule, slotsInHour,
  validateManualAssignment, APPOINTMENT_TYPES, compareApplicants,
} from '../lib/kvkAppointments.mjs';

test('hour options: 24 UTC hours, real values, in order', () => {
  assert.equal(HOUR_OPTIONS.length, 24);
  assert.ok(HOUR_OPTIONS.length > 0);
  assert.equal(HOUR_OPTIONS[0].value, '00:00');
  assert.equal(HOUR_OPTIONS[23].value, '23:00');
  assert.equal(new Set(HOUR_OPTIONS.map((o) => o.value)).size, 24);
});

test('slot options: 48 half-hour slots; ranges wrap at midnight', () => {
  assert.equal(SLOT_OPTIONS.length, 48);
  assert.equal(generateTimeOptions(30).length, 48);
  assert.equal(generateTimeOptions(999).length, 24);
  assert.equal(slotRange('02:00'), '02:00–02:30');
  assert.equal(slotRange('23:30'), '23:30–00:00');
  assert.equal(slotRange('02:15'), null);
  assert.deepEqual(slotsInHour('14:00'), ['14:00', '14:30']);
  assert.deepEqual(slotsInHour('14:30'), []);
});

test('localTimeLabel converts UTC to a zone using the reference date', () => {
  const ref = new Date(Date.UTC(2026, 9, 1));
  assert.match(localTimeLabel('14:00', ref, 'UTC'), /2:00\s?PM/);
  assert.match(localTimeLabel('14:00', ref, 'Asia/Tokyo'), /11:00\s?PM/);
  assert.equal(localTimeLabel('nonsense', ref, 'UTC'), '');
});

test('contribution score: documented weights, monotonic, junk counts as 0', () => {
  assert.deepEqual({ ...CONTRIBUTION_WEIGHTS }, { tg: 1, ttg: 2, speedup_days: 100 });
  assert.equal(contributionScore({ tg: 10, ttg: 5, speedup_days: 2 }), 10 + 10 + 200);
  assert.equal(contributionScore({}), 0);
  assert.equal(contributionScore({ tg: 'abc', ttg: -5, speedup_days: null }), 0);
  assert.equal(contributionScore({ tg: '1,000' }), 1000);
  const base = { tg: 100, ttg: 100, speedup_days: 10 };
  for (const k of ['tg', 'ttg', 'speedup_days']) {
    assert.ok(contributionScore({ ...base, [k]: base[k] + 1 }) > contributionScore(base));
  }
});

const good = { day: 1, buff: 'construction', tg: '1,000', ttg: 50, speedup_days: '12.5', preferred_hours: ['01:00', '02:00', '03:00'] };

test('application validation enforces exactly 3 distinct valid hours', () => {
  const ok = validateApplication(good);
  assert.equal(ok.error, undefined);
  assert.deepEqual([ok.value.tg, ok.value.ttg, ok.value.speedup_days], [1000, 50, 12.5]);
  assert.deepEqual(ok.value.preferred_hours, ['01:00', '02:00', '03:00']);
  for (const hours of [[], ['01:00'], ['01:00', '02:00'], ['01:00', '02:00', '03:00', '04:00'], ['01:00', '01:00', '02:00'], ['01:00', '02:00', '25:00'], ['01:30', '02:00', '03:00'], 'x', null]) {
    assert.ok(validateApplication({ ...good, preferred_hours: hours }).error, JSON.stringify(hours));
  }
});

test('application validation: day/buff pairs and numbers', () => {
  assert.ok(validateApplication({ ...good, day: 3 }).error);
  assert.ok(validateApplication({ ...good, buff: 'research' }).error); // day 1 is construction
  assert.equal(validateApplication({ ...good, day: 2, buff: 'research' }).error, undefined);
  assert.ok(validateApplication({ ...good, tg: '12abc' }).error);
  assert.ok(validateApplication({ ...good, ttg: -1 }).error);
  assert.ok(validateApplication({ ...good, speedup_days: '1.234' }).error);
  assert.equal(validateApplication({ ...good, tg: '', ttg: '', speedup_days: '' }).value.tg, 0);
  assert.ok(validateApplication({ ...good, in_game_name: 'x'.repeat(121) }).error);
});

test('manual assignment validation', () => {
  assert.equal(validateManualAssignment({ day: 1, buff: 'construction', member_id: 'm1', slot: '02:30' }).error, undefined);
  assert.ok(validateManualAssignment({ day: 1, buff: 'construction', member_id: '', slot: '02:30' }).error);
  assert.ok(validateManualAssignment({ day: 1, buff: 'construction', member_id: 'm1', slot: '02:15' }).error);
  assert.ok(validateManualAssignment({ day: 9, buff: 'construction', member_id: 'm1', slot: '02:30' }).error);
});

const app = (member_id, tg, hours, extra = {}) => ({ member_id, tg, ttg: 0, speedup_days: 0, preferred_hours: hours, created_at: '2026-10-01T00:00:00Z', ...extra });

test('allocator gives the best contributor their first preferred hour', () => {
  const r = allocateSlots([app('2', 100, ['05:00', '06:00', '07:00']), app('1', 900, ['05:00', '06:00', '07:00'])]);
  assert.deepEqual(r.assignments.map((a) => [a.member_id, a.slot]), [['1', '05:00'], ['2', '05:30']]);
  assert.deepEqual(r.unassigned, []);
});

test('allocator never double-books and gives at most one slot per member', () => {
  const same = ['05:00', '06:00', '07:00'];
  const apps = Array.from({ length: 10 }, (_, i) => app(String(100 + i), 1000 - i, same));
  apps.push(app('100', 5, same)); // duplicate member id: first application wins
  const r = allocateSlots(apps);
  assert.ok(hasNoDoubleBooking(r.assignments));
  assert.equal(r.assignments.length, 6); // 3 hours x 2 half-hours
  assert.equal(r.unassigned.length, 4);
  assert.ok(r.assignments.every((a) => same.some((h) => a.slot.startsWith(h.slice(0, 2)))));
});

test('allocator tie-breaks deterministically (score, then earlier application, then member id) regardless of input order', () => {
  const a = app('30', 500, ['01:00', '02:00', '03:00'], { created_at: '2026-10-01T00:00:00Z' });
  const b = app('20', 500, ['01:00', '02:00', '03:00'], { created_at: '2026-10-01T00:00:00Z' });
  const c = app('10', 500, ['01:00', '02:00', '03:00'], { created_at: '2026-10-02T00:00:00Z' });
  const expected = allocateSlots([a, b, c]).assignments.map((x) => `${x.member_id}@${x.slot}`);
  assert.deepEqual(expected, ['20@01:00', '30@01:30', '10@02:00']);
  for (const order of [[c, b, a], [b, c, a], [a, c, b]]) {
    assert.deepEqual(allocateSlots(order).assignments.map((x) => `${x.member_id}@${x.slot}`), expected);
  }
  assert.ok(compareApplicants({ member_id: '9', tg: 1 }, { member_id: '10', tg: 1 }) < 0); // numeric id order
});

test('allocator keeps locked (manual) assignments: slot unavailable, member skipped', () => {
  const r = allocateSlots(
    [app('1', 900, ['05:00', '06:00', '07:00']), app('2', 800, ['05:00', '06:00', '07:00'])],
    [{ member_id: '2', slot: '05:00' }],
  );
  assert.deepEqual(r.assignments.map((a) => [a.member_id, a.slot]), [['1', '05:30']]);
});

test('my appointments: status text always has words; assignment only after publish', () => {
  const applications = [{ day: 1, buff: 'construction' }, { day: 2, buff: 'research' }];
  const assignments = [{ day: 1, buff: 'construction', slot: '02:00' }];
  let rows = myAppointmentRows({ applications, assignments, published: false });
  assert.deepEqual(rows.map((r) => r.text), ['Day 1 Construction: Pending', 'Day 2 Research: Pending', 'Day 4 Troop Training: Not applied']);
  rows = myAppointmentRows({ applications, assignments, published: true });
  assert.equal(rows[0].text, 'Day 1 Construction: Assigned 02:00–02:30');
  assert.equal(rows[0].status, 'assigned');
  assert.equal(rows[2].status, 'not_applied');
});

test('schedule grid has 48 slots per type and names filled ones', () => {
  const grid = buildSchedule([{ day: 4, buff: 'training', slot: '10:30', name: 'Ann' }]);
  assert.equal(grid.length, APPOINTMENT_TYPES.length);
  assert.ok(grid.every((d) => d.slots.length === 48));
  const day4 = grid.find((d) => d.day === 4);
  assert.equal(day4.filled, 1);
  assert.equal(day4.slots.find((s) => s.slot === '10:30').name, 'Ann');
});
