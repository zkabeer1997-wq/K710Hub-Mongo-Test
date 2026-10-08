import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeFormStatuses, firstIncomplete, stillNeedsSummary, MEMBER_FORMS } from '../lib/memberForms.mjs';
import { validateParticipation, parsePower, EVENT_FORMS, EVENT_FORM_GATE_KEYS, findEventForm } from '../lib/eventForms.mjs';
import { EVENT_GATE_KEYS, FORM_GATE_KEYS, DEFAULT_GATES } from '../lib/formGates.mjs';
import { parseGateWindow, toUtcInput, fromUtcInput } from '../lib/formGateWindow.mjs';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const H = 3600e3;
const gates = {
  swordland: { is_open: true, opens_at: new Date(NOW - H).toISOString(), closes_at: new Date(NOW + 5 * H).toISOString() },
  'tri-alliance': { is_open: true, opens_at: new Date(NOW - H).toISOString(), closes_at: null },
  'castle-battle': { is_open: true, opens_at: new Date(NOW + 24 * H).toISOString(), closes_at: null }, // legacy gate row: must be ignored
  prep: { is_open: false },
};

test('event gate keys line up between formGates and eventForms', () => {
  assert.deepEqual(EVENT_GATE_KEYS, EVENT_FORM_GATE_KEYS);
  for (const key of EVENT_GATE_KEYS) assert.ok(FORM_GATE_KEYS.includes(key) && DEFAULT_GATES[key]);
  assert.equal(new Set(EVENT_FORMS.map((f) => f.slug)).size, EVENT_FORMS.length);
  assert.deepEqual(EVENT_GATE_KEYS, ['swordland', 'tri-alliance']);
  assert.equal(FORM_GATE_KEYS.includes('castle-battle'), false);
  assert.equal(EVENT_FORMS.find((f) => f.gateKey === 'swordland').slug, 'swordland-showdown');
  assert.equal(findEventForm('castle-battle'), null);
});

test('computeFormStatuses: dots only for open + unsubmitted, badges for windows', () => {
  const statuses = computeFormStatuses({ gates, submissions: { lead: '2026-09-01T00:00:00Z', 'tri-alliance': '2026-10-01T10:00:00Z' }, now: NOW });
  const by = Object.fromEntries(statuses.map((s) => [s.key, s]));
  assert.equal(by.lead.needsInput, false);
  assert.equal(by.joiner.needsInput, true);
  assert.equal(by.prep.state, 'closed');
  assert.equal(by.prep.needsInput, false);
  assert.equal(by.prep.badge, 'Closed');
  assert.equal(by.swordland.needsInput, true);
  assert.equal(by['tri-alliance'].submitted, true);
  assert.equal(by['castle-battle'], undefined);
  assert.equal(by.swordland.label, 'Swordland Summit vote');
  assert.equal(statuses.length, MEMBER_FORMS.length);
});

test('event forms never need input before an admin schedules a window', () => {
  const by = Object.fromEntries(computeFormStatuses({ gates: {}, now: NOW }).map((s) => [s.key, s]));
  assert.equal(by.swordland.state, 'upcoming');
  assert.equal(by.swordland.needsInput, false);
  assert.equal(by.joiner.needsInput, true);
});

test('summary lists pending event votes; Get started targets an event vote first', () => {
  const statuses = computeFormStatuses({ gates, submissions: { lead: 'x', joiner: 'x', dragon: 'x', noble: 'x', 'tri-alliance': 'x' }, now: NOW });
  assert.equal(stillNeedsSummary(statuses), 'Still needs your input: Swordland');
  assert.equal(firstIncomplete(statuses).href, '/forms/swordland-showdown');
  const all = computeFormStatuses({ gates, submissions: { lead: 'x', joiner: 'x', dragon: 'x', noble: 'x', swordland: 'x', 'tri-alliance': 'x' }, now: NOW });
  assert.equal(firstIncomplete(all), null);
  assert.equal(stillNeedsSummary(all), null);
});

test('validateParticipation / parsePower', () => {
  assert.deepEqual(validateParticipation({ vote: 'flexible', power: '48,500,000' }).value, { vote: 'flexible', power: 48500000 });
  assert.ok(validateParticipation({ vote: 'maybe', power: 1 }).error);
  assert.ok(validateParticipation({ vote: 'absent', power: '12abc' }).error);
  assert.ok(validateParticipation({ vote: 'absent', power: -5 }).error);
  assert.ok(validateParticipation({ vote: 'absent', power: '' }).error);
  assert.equal(parsePower('1 234'), 1234);
  assert.equal(parsePower(1.5), null);
  assert.equal(parsePower('999999999999999'), null);
  assert.equal(parsePower(0), 0);
});

test('parseGateWindow validates order, keeps untouched ends, clears with empty', () => {
  assert.ok(parseGateWindow({ opens_at: '2026-10-05T10:00:00Z', closes_at: '2026-10-05T09:00:00Z' }).error);
  assert.ok(parseGateWindow({ opens_at: 'nonsense' }).error);
  assert.ok(parseGateWindow({ cycle_id: 'bad id!' }).error);
  const existing = { opens_at: '2026-10-05T10:00:00Z', closes_at: null };
  assert.ok(parseGateWindow({ closes_at: '2026-10-05T09:00:00Z' }, existing).error);
  const ok = parseGateWindow({ closes_at: '2026-10-06T09:00:00Z', cycle_id: '' }, existing);
  assert.equal(ok.fields.closes_at.toISOString(), '2026-10-06T09:00:00.000Z');
  assert.equal(ok.fields.cycle_id, 'current');
  assert.ok(!('opens_at' in ok.fields));
  assert.equal(parseGateWindow({ opens_at: '' }).fields.opens_at, null);
});

test('UTC datetime-local helpers round-trip', () => {
  assert.equal(toUtcInput('2026-10-05T14:00:00.000Z'), '2026-10-05T14:00');
  assert.equal(fromUtcInput('2026-10-05T14:00'), '2026-10-05T14:00:00.000Z');
  assert.equal(fromUtcInput(''), null);
  assert.equal(toUtcInput(null), '');
});
