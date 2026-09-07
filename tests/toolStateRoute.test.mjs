import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedToolKey, SUPPORTED_TOOL_KEYS } from '../lib/toolKeys.mjs';

test('tool state keys are explicitly allowlisted', () => {
  assert.ok(SUPPORTED_TOOL_KEYS.includes('pet-pack-optimizer'));
  assert.equal(isSupportedToolKey('pet-pack-optimizer'), true);
  assert.equal(isSupportedToolKey('invented-tool'), false);
  assert.equal(isSupportedToolKey('../member-pins'), false);
});
