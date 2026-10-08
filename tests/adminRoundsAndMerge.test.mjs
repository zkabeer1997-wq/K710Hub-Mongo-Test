import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMergeSafePayload } from '../lib/flamedragonForm.mjs';
import { newRound, VOTE_FORM_KEYS, DEFAULT_GATES } from '../lib/formGates.mjs';

test('partial flamedragon POST only updates the fields it sends', () => {
  const full = { member_id: '1', name: 'A', pet_power: null, masters_power: '5', updated_at: 'now' };
  const existing = { member_id: '1', name: 'A', pet_power: '9' };
  assert.deepEqual(buildMergeSafePayload(full, { masters_power: '5' }, existing), { member_id: '1', updated_at: 'now', masters_power: '5' });
  assert.deepEqual(buildMergeSafePayload(full, { masters_power: '5' }, null), full, 'new records get every field');
});

test('newRound gives a fresh id and a readable label', () => {
  const r = newRound(Date.UTC(2026, 9, 20), '');
  assert.equal(r.cycle_id, `r-${Date.UTC(2026, 9, 20)}`);
  assert.equal(r.round_label, 'Round of 2026-10-20');
  assert.equal(newRound(1, '  Autumn clash  ').round_label, 'Autumn clash');
  assert.notEqual(newRound(1).cycle_id, newRound(2).cycle_id);
});

test('vote forms are the three event gates and default to an empty round label', () => {
  assert.deepEqual(VOTE_FORM_KEYS, ['swordland', 'tri-alliance', 'castle-battle']);
  assert.equal(DEFAULT_GATES.swordland.round_label, '');
});
