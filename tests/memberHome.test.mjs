import test from 'node:test';
import assert from 'node:assert/strict';
import { displayNameFor, resolveAllianceTag } from '../lib/memberHome.mjs';

test('displayNameFor ignores nicknames that are just the player id', () => {
  assert.equal(displayNameFor({ memberId: '123456', nickname: '123456' }), '');
  assert.equal(displayNameFor({ memberId: '123456', nickname: ' Yumin ' }), 'Yumin');
  assert.equal(displayNameFor(null), '');
});

test('resolveAllianceTag matches published tags case-insensitively and falls through', () => {
  assert.equal(resolveAllianceTag(['red'], ['710', 'RED', 'SKY']), 'RED');
  assert.equal(resolveAllianceTag(['', 'Other', 'sky'], ['710', 'RED', 'SKY']), 'SKY');
  assert.equal(resolveAllianceTag(['Other'], ['710', 'RED', 'SKY']), null);
});
