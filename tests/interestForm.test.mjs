import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeAge, draftFilledCount, formatFileSize, formatWithCommas, normalizeDiscordUsername,
  normalizeNumericAnswer, normalizePlayerId, numberPreview, parseNumberInput, playerIdHint,
  readDraftSavedAt, shouldOfferResume, statusCopy, validateNumericAnswer,
} from '../lib/interestForm.mjs';

test('parseNumberInput accepts plain, comma, space, dot-thousands and suffix formats', () => {
  assert.equal(parseNumberInput('12345678').digits, '12345678');
  assert.equal(parseNumberInput('12,345,678').digits, '12345678');
  assert.equal(parseNumberInput('12 345 678').digits, '12345678');
  assert.equal(parseNumberInput('12.345.678').digits, '12345678');
  assert.equal(parseNumberInput('12.3M').digits, '12300000');
  assert.equal(parseNumberInput('12m').digits, '12000000');
  assert.equal(parseNumberInput('12,3 M').digits, '12300000');
  assert.equal(parseNumberInput('450k').digits, '450000');
  assert.equal(parseNumberInput('1.2B').digits, '1200000000');
  assert.equal(parseNumberInput('0').digits, '0');
});

test('parseNumberInput rejects letters, negatives and odd shapes', () => {
  for (const bad of ['abc', '-5', '12.3', '1,23', '12M3', '1e6', '12..3']) assert.equal(parseNumberInput(bad).ok, false, bad);
  assert.equal(parseNumberInput('').empty, true);
  assert.equal(parseNumberInput(null).ok, false);
});

test('number previews and formatting', () => {
  assert.equal(numberPreview('12.3M'), 'You typed: 12,300,000');
  assert.equal(numberPreview('nope'), '');
  assert.equal(formatWithCommas(1234567), '1,234,567');
  assert.equal(normalizeNumericAnswer('12.3M'), '12300000');
  assert.equal(normalizeNumericAnswer('245,000,000'), '245000000');
  assert.equal(normalizeNumericAnswer('abc'), 'abc');
});

test('discord username and player id normalisation', () => {
  assert.equal(normalizeDiscordUsername('  @@QaTest  '), 'QaTest');
  assert.equal(normalizeDiscordUsername('name#1234'), 'name#1234');
  assert.equal(normalizeDiscordUsername('​@x'), 'x');
  assert.equal(normalizePlayerId('ID: 123 456'), '123456');
  assert.equal(playerIdHint('12a'), 'Numbers only. We will remove the other characters.');
  assert.equal(playerIdHint('123 456'), '');
});

test('draft prompt logic', () => {
  assert.equal(draftFilledCount({ inGameName: 'a', t11: [], website: 'x', playerId: ' ' }), 1);
  assert.equal(shouldOfferResume({ inGameName: 'a' }), false);
  assert.equal(shouldOfferResume({ inGameName: 'a', playerId: '1' }), true);
  assert.equal(shouldOfferResume(null), false);
  assert.equal(readDraftSavedAt(JSON.stringify({ savedAt: 5 })), 5);
  assert.equal(readDraftSavedAt('{bad'), null);
  const now = 10_000_000_000;
  assert.equal(describeAge(now - 20_000, now), 'just now');
  assert.equal(describeAge(now - 5 * 60_000, now), '5 minutes ago');
  assert.equal(describeAge(now - 2 * 3600_000, now), '2 hours ago');
  assert.equal(describeAge(now - 3 * 86400_000, now), '3 days ago');
  assert.equal(describeAge(undefined, now), '');
});

test('file sizes and status copy', () => {
  assert.equal(formatFileSize(84 * 1024), '84 KB');
  assert.equal(formatFileSize(1.5 * 1024 * 1024), '1.5 MB');
  for (const s of ['pending', 'accepted', 'waitlist', 'rejected']) assert.ok(statusCopy(s).next.length > 10);
  assert.equal(statusCopy('weird').title, 'Waiting for review');
});

test('total power boundaries', () => {
  const ok = (v) => validateNumericAnswer('total_power', v);
  assert.equal(ok('3000000000').ok, true);
  assert.equal(ok('3,000,000,000').ok, true);
  assert.equal(ok('3b').digits, '3000000000');
  assert.equal(ok('2.9b').digits, '2900000000');
  assert.equal(ok('3000000001').ok, false);
  assert.equal(ok('3.1b').error, 'Total power cannot be more than 3,000,000,000. Check the number and try again.');
  assert.equal(ok('1'.repeat(30)).error, 'Total power cannot be more than 3,000,000,000. Check the number and try again.');
  assert.equal(ok('0').ok, false);
  assert.equal(ok('').empty, true);
  assert.equal(ok('abc').ok, false);
  assert.equal(ok('12.3M').digits, '12300000');
});

test('Mystic Trial stages boundaries are plain integers only', () => {
  const m = (v) => validateNumericAnswer('mystic_trial_stages', v);
  assert.equal(m('0').ok, true);
  assert.equal(m('4000').ok, true);
  assert.equal(m('4,000').ok, true);
  assert.equal(m('4001').error, 'Mystic Trial stages cannot be more than 4,000.');
  assert.equal(m('4k').ok, false);
  assert.equal(m('1m').ok, false);
  assert.equal(m('12.5').ok, false);
});

test('numberPreview turns into the error past a limit', () => {
  assert.equal(numberPreview('12345', 'total_power'), 'You typed: 12,345');
  assert.match(numberPreview('3100000000', 'total_power'), /cannot be more than 3,000,000,000/);
  assert.equal(numberPreview('', 'total_power'), '');
  assert.equal(normalizeNumericAnswer('4k', 'mystic_trial_stages'), '4k');
  assert.equal(normalizeNumericAnswer('3b', 'total_power'), '3000000000');
});
