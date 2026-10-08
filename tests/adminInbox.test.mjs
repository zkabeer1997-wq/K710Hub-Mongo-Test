import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decisionConfirmText, acceptanceMessage, findDuplicateApplicants, normalizeRequestStatus, requestDisplayName,
} from '../lib/adminInbox.mjs';

test('decisionConfirmText states the effect', () => {
  assert.match(decisionConfirmText('normal', 'Test Aria'), /Accept Test Aria into 710\? They will be able to sign in\./);
  assert.match(decisionConfirmText('reject', ''), /Reject this applicant/);
  assert.match(decisionConfirmText('waitlist', 'X'), /waitlist/);
});

test('acceptanceMessage includes the login link and Player ID', () => {
  const msg = acceptanceMessage({ name: 'Aria', playerId: '123', origin: 'https://k710.example/' });
  assert.match(msg, /Hi Aria!/);
  assert.match(msg, /https:\/\/k710\.example\/login/);
  assert.match(msg, /\(123\)/);
});

test('findDuplicateApplicants flags shared player ids only', () => {
  const rows = [{ id: 'a', player_id: '1' }, { id: 'b', player_id: '1' }, { id: 'c', player_id: '2' }, { id: 'd', player_id: '' }, { id: 'e', player_id: '' }];
  const d = findDuplicateApplicants(rows);
  assert.deepEqual(d.get('a'), ['b']);
  assert.deepEqual(d.get('b'), ['a']);
  assert.equal(d.has('c'), false);
  assert.equal(d.has('d'), false);
});

test('request status and display name fallbacks', () => {
  assert.equal(normalizeRequestStatus('reviewed'), 'done');
  assert.equal(normalizeRequestStatus(undefined), 'new');
  assert.equal(normalizeRequestStatus('in_progress'), 'in_progress');
  assert.deepEqual(requestDisplayName({ name: 'Bob', member_id: '5' }), { name: 'Bob', note: '' });
  assert.deepEqual(requestDisplayName({ name: '920000009', member_id: '920000009' }, new Map([['920000009', 'Nick']])), { name: 'Nick', note: 'Kingshot name' });
  assert.deepEqual(requestDisplayName({ name: '', member_id: '77' }), { name: 'Member 77', note: 'not on the roster' });
});
