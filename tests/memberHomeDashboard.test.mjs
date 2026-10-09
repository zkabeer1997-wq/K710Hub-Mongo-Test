import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHome, cardDate, cardState, formatDay, DASHBOARD_FORM_KEYS } from '../components/member/memberHome.mjs';
import { computeFormStatuses, orderMemberForms } from '../lib/memberForms.mjs';
import { visibleMemberItems } from '../lib/memberResults.mjs';

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);

function statusFor(gates, submissions = {}, cycles = {}) {
  const ordered = orderMemberForms(computeFormStatuses({ gates, submissions, now: NOW }), cycles, NOW);
  const { forms, results, hidden } = visibleMemberItems(ordered, []);
  return { forms, results, hidden };
}

test('the four forms appear numbered 1-4 in the owner order, Power Profile is separate', () => {
  const home = buildHome(statusFor({}));
  assert.deepEqual(DASHBOARD_FORM_KEYS, ['prep', 'noble', 'dragon', 'joiner']);
  assert.deepEqual(home.cards.map((c) => [c.number, c.key]), [[1, 'prep'], [2, 'noble'], [3, 'dragon'], [4, 'joiner']]);
  assert.equal(home.power.key, 'lead');
  assert.ok(!home.cards.some((c) => c.key === 'lead'));
  assert.equal(home.left, 4);
});

test('a form disappears when its gate is closed and returns when it opens', () => {
  const closed = buildHome(statusFor({ noble: { is_open: false } }));
  assert.deepEqual(closed.cards.map((c) => c.key), ['prep', 'dragon', 'joiner']);
  assert.deepEqual(closed.cards.map((c) => c.number), [1, 2, 3]);
  assert.equal(closed.left, 3);
  const reopened = buildHome(statusFor({ noble: { is_open: true } }));
  assert.equal(reopened.cards.length, 4);
});

test('done forms are not counted as left and show the done state', () => {
  const home = buildHome(statusFor({}, { prep: '2026-10-08T10:00:00Z', joiner: '2026-10-08T11:00:00Z' }));
  assert.equal(home.left, 2);
  assert.equal(home.cards.find((c) => c.key === 'prep').card, 'done');
  assert.equal(home.cards.find((c) => c.key === 'noble').card, 'todo');
});

test('everything closed gives an empty list and zero left', () => {
  const gates = Object.fromEntries(['prep', 'noble', 'dragon', 'joiner', 'lead', 'swordland', 'tri-alliance'].map((k) => [k, { is_open: false }]));
  const home = buildHome(statusFor(gates));
  assert.equal(home.cards.length, 0);
  assert.equal(home.left, 0);
});

test('card state and date line', () => {
  assert.equal(cardState({ state: 'closed' }), 'closed');
  assert.equal(cardState({ state: 'upcoming' }), 'soon');
  assert.equal(cardState({ state: 'open', submitted: true }), 'done');
  assert.equal(cardState({ state: 'open', carriedOver: true }), 'carry');
  assert.deepEqual(cardDate({ deadline: { kind: 'closes', at: 5 } }), { kind: 'before', at: 5 });
  assert.deepEqual(cardDate({ deadline: { kind: 'cycle', at: 6 } }), { kind: 'before', at: 6 });
  assert.deepEqual(cardDate({ deadline: null }), { kind: 'none', at: null });
});

test('saved date is short and never throws on bad input', () => {
  assert.equal(formatDay('2026-10-08T10:00:00Z', 'en'), '8 Oct');
  assert.equal(formatDay('garbage', 'en'), '');
  assert.equal(buildHome(undefined).cards.length, 0);
});
