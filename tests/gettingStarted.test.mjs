import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getChecklistState, hasGearProfile, hasKvkSubmission } from '../lib/gettingStarted.mjs';

test('hasGearProfile is false for missing/empty input', () => {
  assert.equal(hasGearProfile(null), false);
  assert.equal(hasGearProfile(undefined), false);
  assert.equal(hasGearProfile({}), false);
  assert.equal(hasGearProfile({ governor_gear: '', charms: null }), false);
});

test('hasGearProfile is true when updated_at is set', () => {
  assert.equal(hasGearProfile({ updated_at: '2026-09-15T00:00:00.000Z' }), true);
});

test('hasGearProfile is true when any signal field is populated', () => {
  assert.equal(hasGearProfile({ governor_gear: 'Infantry 1: Legendary' }), true);
  assert.equal(hasGearProfile({ mystic_trial_score: '12000' }), true);
  assert.equal(hasGearProfile({ mystic_trial_score: 0 }), true); // "0" is still an entered value
});

test('hasKvkSubmission requires a non-empty availability value', () => {
  assert.equal(hasKvkSubmission(null), false);
  assert.equal(hasKvkSubmission({}), false);
  assert.equal(hasKvkSubmission({ availability: '' }), false);
  assert.equal(hasKvkSubmission({ availability: '   ' }), false);
  assert.equal(hasKvkSubmission({ availability: 'Full battle (12-17 UTC)' }), true);
});

test('getChecklistState returns all three items with defaults incomplete', () => {
  const items = getChecklistState();
  assert.equal(items.length, 3);
  const keys = items.map((item) => item.key);
  assert.deepEqual(keys, ['gear-profile', 'kvk-form', 'bear-hunt']);
  for (const item of items) {
    assert.equal(item.complete, false);
    assert.equal(typeof item.label, 'string');
    assert.ok(item.label.length > 0);
  }
});

test('getChecklistState marks the gear item complete from a power profile', () => {
  const items = getChecklistState({ powerProfile: { updated_at: '2026-09-01T00:00:00.000Z' } });
  const gear = items.find((item) => item.key === 'gear-profile');
  assert.equal(gear.complete, true);
});

test('getChecklistState marks the KvK item complete from an availability submission', () => {
  const items = getChecklistState({ kvkAvailability: { availability: 'First half (12-14:30 UTC)' } });
  const kvk = items.find((item) => item.key === 'kvk-form');
  assert.equal(kvk.complete, true);
});

test('getChecklistState never marks bear-hunt complete and flags it always-actionable', () => {
  const items = getChecklistState({
    powerProfile: { updated_at: 'x' },
    kvkAvailability: { availability: 'x' },
  });
  const bearHunt = items.find((item) => item.key === 'bear-hunt');
  assert.equal(bearHunt.complete, false);
  assert.equal(bearHunt.alwaysActionable, true);
});

test('getChecklistState tolerates malformed input without throwing', () => {
  assert.doesNotThrow(() => getChecklistState({ powerProfile: 'nope', kvkAvailability: 42 }));
  const items = getChecklistState({ powerProfile: 'nope', kvkAvailability: 42 });
  assert.equal(items.every((item) => item.complete === false), true);
});
