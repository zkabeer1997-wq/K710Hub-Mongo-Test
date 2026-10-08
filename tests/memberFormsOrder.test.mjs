import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeFormStatuses, orderMemberForms, dashboardLinks, cycleDeadlineEntries, isCycleOngoing, FORM_PLAIN, MEMBER_FORMS,
} from '../lib/memberForms.mjs';
import { buildDeadlineEntries } from '../lib/deadlines.mjs';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const H = 3600e3;
const iso = (ms) => new Date(ms).toISOString();
const voteGates = {
  swordland: { is_open: true, opens_at: iso(NOW - H), closes_at: iso(NOW + 48 * H) },
  'tri-alliance': { is_open: true, opens_at: iso(NOW - H), closes_at: iso(NOW + 24 * H) },
};
const kvk = { label: 'KvK 12', status: 'collecting', start: '2026-10-01', end: '2026-10-08' };
const dragon = { label: 'FD 5', status: 'collecting', start: null, end: '2026-10-20' };
const keys = (list) => list.map((f) => f.key);
const build = (gates = voteGates, submissions = {}) => computeFormStatuses({ gates, submissions, now: NOW });

test('KvK ongoing: KvK forms, Power Profile, votes, then other open forms', () => {
  const out = orderMemberForms(build(), { kvk, flamedragon: { ...dragon, status: 'ended' } }, NOW);
  assert.deepEqual(keys(out), ['prep', 'joiner', 'lead', 'tri-alliance', 'swordland', 'dragon', 'noble']);
  assert.equal(out[0].group, 'cycle');
  assert.equal(out[2].group, 'profile');
});

test('Flamedragon ongoing puts Tyrant and Noble Advisor first', () => {
  const out = orderMemberForms(build(), { kvk: { ...kvk, status: 'ended' }, flamedragon: dragon }, NOW);
  assert.deepEqual(keys(out).slice(0, 4), ['dragon', 'noble', 'lead', 'tri-alliance']);
});

test('both ongoing: soonest-ending cycle first; ties go to KvK; dates outside now are not ongoing', () => {
  assert.deepEqual(keys(orderMemberForms(build(), { kvk, flamedragon: dragon }, NOW)).slice(0, 4), ['prep', 'joiner', 'dragon', 'noble']);
  const kvkLate = { ...kvk, end: '2026-11-30' };
  assert.deepEqual(keys(orderMemberForms(build(), { kvk: kvkLate, flamedragon: dragon }, NOW)).slice(0, 2), ['dragon', 'noble']);
  assert.deepEqual(keys(orderMemberForms(build(), { kvk: { ...kvk, end: null }, flamedragon: { ...dragon, end: null } }, NOW)).slice(0, 1), ['prep']);
  assert.equal(isCycleOngoing({ ...kvk, end: '2026-10-07' }, NOW), false);
  assert.equal(isCycleOngoing({ ...kvk, start: '2026-10-09' }, NOW), false);
  assert.equal(isCycleOngoing(kvk, NOW), true); // date-only end = end of that UTC day
});

test('no ongoing cycle: Power Profile, votes, then the rest in registry order', () => {
  const out = orderMemberForms(build(), {}, NOW);
  assert.deepEqual(keys(out).slice(0, 3), ['lead', 'tri-alliance', 'swordland']);
  assert.equal(out.length, MEMBER_FORMS.length);
});

test('closed and not-yet-open forms sit at the very bottom, opening soon before closed', () => {
  const gates = { ...voteGates, joiner: { is_open: false }, swordland: { is_open: true, opens_at: iso(NOW + 72 * H), closes_at: null }, dragon: { is_open: false } };
  const out = orderMemberForms(build(gates), { kvk, flamedragon: dragon }, NOW);
  const tail = keys(out).slice(-3);
  assert.deepEqual(tail, ['swordland', 'joiner', 'dragon']);
  assert.deepEqual(out.slice(-3).map((f) => f.group), ['upcoming', 'closed', 'closed']);
  assert.equal(out[out.length - 3].deadline.kind, 'opens');
});

test('forms that still need input come before finished ones within a group', () => {
  const out = orderMemberForms(build(voteGates, { prep: iso(NOW - H), 'tri-alliance': iso(NOW - H) }), { kvk }, NOW);
  assert.deepEqual(keys(out).slice(0, 2), ['joiner', 'prep']);
  const votes = keys(out).filter((k) => k === 'swordland' || k === 'tri-alliance');
  assert.deepEqual(votes, ['swordland', 'tri-alliance']);
});

test('deadlines: own window first, cycle end when the form has none', () => {
  const gates = { ...voteGates, prep: { is_open: true, opens_at: null, closes_at: iso(NOW + 5 * H) } };
  const out = Object.fromEntries(orderMemberForms(build(gates), { kvk }, NOW).map((f) => [f.key, f]));
  assert.deepEqual(out.prep.deadline, { at: NOW + 5 * H, kind: 'closes' });
  assert.equal(out.joiner.deadline.kind, 'cycle');
  assert.equal(out.joiner.deadline.at, Date.parse('2026-10-09T00:00:00Z'));
  assert.equal(out.lead.deadline, null);
});

test('orderMemberForms does not mutate its input', () => {
  const statuses = build();
  const copy = JSON.stringify(statuses);
  orderMemberForms(statuses, { kvk }, NOW);
  assert.equal(JSON.stringify(statuses), copy);
});

test('dashboard links: Admin only for admin and superadmin', () => {
  const base = ['/events', '/guides', '/tools'];
  assert.deepEqual(dashboardLinks('member').map((l) => l.href), base);
  assert.deepEqual(dashboardLinks(undefined).map((l) => l.href), base);
  assert.deepEqual(dashboardLinks('admin').map((l) => l.href), [...base, '/admin/dashboard/overview']);
  assert.deepEqual(dashboardLinks('superadmin').map((l) => l.href).slice(-1), ['/admin/dashboard/overview']);
  assert.deepEqual(dashboardLinks('member').map((l) => l.label), ['Events & schedules', 'Guides', 'Upgrade calculators & tools']);
});

test('deadline entries include every form deadline and the cycle end', () => {
  const gates = { ...voteGates, prep: { is_open: true, opens_at: null, closes_at: iso(NOW + 5 * H) }, noble: { is_open: true, opens_at: iso(NOW + 30 * H), closes_at: null } };
  const forms = computeFormStatuses({ gates, now: NOW });
  const cycles = cycleDeadlineEntries(forms, { kvk, flamedragon: dragon }, NOW);
  assert.deepEqual(cycles.map((c) => c.id), ['kvk', 'flamedragon']);
  const entries = buildDeadlineEntries({ events: [], forms, cycles }, NOW);
  const labels = entries.map((e) => e.label);
  assert.ok(labels.includes('Swordland vote closes'));
  assert.ok(labels.includes('KvK Prep & Appointments closes'));
  assert.ok(labels.includes('Noble Advisor opens'));
  assert.ok(labels.includes('KvK cycle ends'));
  assert.deepEqual(entries.map((e) => e.at), [...entries.map((e) => e.at)].sort((a, b) => a - b));
});

test('every form has plain-language text', () => {
  for (const form of MEMBER_FORMS) assert.ok(FORM_PLAIN[form.key], form.key);
});
