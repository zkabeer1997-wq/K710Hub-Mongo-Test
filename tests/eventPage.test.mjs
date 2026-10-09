import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionSummary, assignedMemberIds, buildEventSearch, compactTroopLevels, filterByAssignment,
  formsStripSummary, heroChips, lastTabStorageKey, planBulkAddToRally, readEventUrl, resolveEventTab, splitAvailability,
} from '../lib/eventPage.mjs';
import { assignMemberToRally } from '../app/admin/dashboard/rallyState.mjs';

const TABS = [{ id: 'participants' }, { id: 'rallies' }, { id: 'appointments' }, { id: 'history' }];

test('URL state: tab and filter parse, with bad values dropped', () => {
  assert.deepEqual(readEventUrl('?tab=participants&filter=unassigned', TABS), { tab: 'participants', filter: 'unassigned' });
  assert.deepEqual(readEventUrl('?tab=nope&filter=x', TABS), { tab: '', filter: '' });
  assert.equal(readEventUrl('?tab=prep', TABS).tab, 'appointments');
  assert.deepEqual(readEventUrl('', TABS), { tab: '', filter: '' });
});

test('URL state: building keeps other params and only keeps filter on Participants', () => {
  assert.equal(buildEventSearch('', { tab: 'participants', filter: 'assigned' }), '?tab=participants&filter=assigned');
  assert.equal(buildEventSearch('?tab=participants&filter=assigned&x=1', { tab: 'rallies', filter: 'assigned' }), '?tab=rallies&x=1');
  assert.equal(buildEventSearch('?tab=participants&filter=assigned', { tab: 'participants', filter: '' }), '?tab=participants');
});

test('remembered tab: URL wins, then stored, then participants', () => {
  assert.equal(resolveEventTab(TABS, 'history', 'rallies'), 'history');
  assert.equal(resolveEventTab(TABS, '', 'rallies'), 'rallies');
  assert.equal(resolveEventTab(TABS, '', 'gone'), 'participants');
  assert.equal(resolveEventTab(TABS, '', null), 'participants');
  assert.notEqual(lastTabStorageKey('kvk'), lastTabStorageKey('flamedragon'));
});

test('assigned / unassigned filter counts leads and joiners', () => {
  const rallies = [{ id: 'a', memberIds: ['1', 2], leadMemberId: '3' }, { id: 'b', memberIds: [], leadMemberId: '' }];
  const ids = assignedMemberIds(rallies);
  const rows = [1, 2, 3, 4].map((n) => ({ member_id: String(n) }));
  assert.deepEqual(filterByAssignment(rows, 'assigned', ids).map((r) => r.member_id), ['1', '2', '3']);
  assert.deepEqual(filterByAssignment(rows, 'unassigned', ids).map((r) => r.member_id), ['4']);
  assert.equal(filterByAssignment(rows, '', ids).length, 4);
});

test('forms strip summary and action summaries state exactly what happens', () => {
  assert.equal(formsStripSummary([{ is_open: true }, { is_open: false }, { is_open: true }]).text, '2 of 3 forms open');
  const state = { counts: { forms_open: 3, forms_total: 3, applicants: 184 }, cycle: { label: 'KvK 5' } };
  assert.equal(actionSummary('close_forms', state), 'Closes 3 forms; 184 answers kept');
  assert.equal(actionSummary('close_forms', { counts: { forms_open: 1, applicants: 1 } }), 'Closes 1 form; 1 answer kept');
  assert.match(actionSummary('start_cycle', state), /KvK 5.*History.*184 applicants/);
  assert.match(actionSummary('open_forms', { counts: { forms_open: 1, forms_total: 3 } }), /^Opens 2 forms/);
});

test('hero chips show the top 3 plus a count', () => {
  const h = heroChips(['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(h.shown, ['A', 'B', 'C']);
  assert.equal(h.restCount, 2);
  assert.deepEqual(h.rest, ['D', 'E']);
  assert.equal(heroChips(['A']).restCount, 0);
  assert.equal(heroChips(null).all.length, 0);
});

test('troop levels compact into one line, skipping empty units', () => {
  assert.equal(compactTroopLevels({ infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG7', archer_tier: 'T11', archer_tg: 'TG6' }), 'I T11/TG8 · C T10/TG7 · A T11/TG6');
  assert.equal(compactTroopLevels({ cavalry_tier: 'T10' }), 'C T10');
  assert.equal(compactTroopLevels({}), '');
});

test('availability splits into label and UTC detail', () => {
  assert.deepEqual(splitAvailability('First half (12-14:30 UTC)'), { label: 'First half', detail: '12-14:30 UTC' });
  assert.deepEqual(splitAvailability('Not Available'), { label: 'Not Available', detail: '' });
});

test('bulk add to rally skips leads and members already placed, adds the rest', () => {
  const rallies = [
    { id: 'a', name: 'Rally 1', memberIds: ['2'], leadMemberId: '1' },
    { id: 'b', name: 'Rally 2', memberIds: [], leadMemberId: '' },
  ];
  const plan = planBulkAddToRally(rallies, 'b', ['1', '2', '3', '4'], assignMemberToRally, (id) => `M${id}`);
  assert.deepEqual(plan.added, ['3', '4']);
  assert.deepEqual(plan.skipped.map((s) => s.id), ['1', '2']);
  assert.deepEqual(plan.rallies.find((r) => r.id === 'b').memberIds, ['3', '4']);
  assert.deepEqual(plan.rallies.find((r) => r.id === 'a').memberIds, ['2']);
  assert.match(plan.message, /Added 2 members to Rally 2\. Skipped 2: M1 is a rally lead; M2 is already in Rally 1\./);
  const none = planBulkAddToRally(rallies, 'b', ['1'], assignMemberToRally);
  assert.equal(none.added.length, 0);
  assert.equal(none.rallies, rallies);
  assert.match(planBulkAddToRally(rallies, 'zzz', ['3'], assignMemberToRally).message, /no longer exists/);
});
