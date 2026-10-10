import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAccessRemoved } from '../lib/memberAccessRemoval.mjs';

test('only a user with a removal date counts as removed', () => {
  assert.equal(isAccessRemoved(null), false);
  assert.equal(isAccessRemoved({ player_id: '1' }), false);
  assert.equal(isAccessRemoved({ access_removed_at: null }), false);
  assert.equal(isAccessRemoved({ access_removed_at: new Date() }), true);
});
