import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolStateEnvelope, migratePetPackState, readToolState } from '../lib/toolState.mjs';

test('wraps tool inputs with explicit schema metadata', () => {
  assert.deepEqual(createToolStateEnvelope('pet-pack-optimizer', 1, { maxWeeks: 8 }), {
    envelopeVersion: 1, toolKey: 'pet-pack-optimizer', schemaVersion: 1, inputs: { maxWeeks: 8 },
  });
});

test('migrates a legacy pet state without deleting its inputs', () => {
  const legacy = { need: { food: 10 }, have: { food: 2 }, ownedChests: 3, maxWeeks: 4 };
  assert.deepEqual(readToolState(legacy, { toolKey: 'pet-pack-optimizer', schemaVersion: 1, migrate: migratePetPackState }), legacy);
});

test('rejects state belonging to another tool or a newer schema', () => {
  const envelope = createToolStateEnvelope('other-tool', 1, { value: 1 });
  assert.equal(readToolState(envelope, { toolKey: 'pet-pack-optimizer', schemaVersion: 1, migrate: value => value }), null);
  assert.equal(readToolState({ ...envelope, toolKey: 'pet-pack-optimizer', schemaVersion: 2 }, { toolKey: 'pet-pack-optimizer', schemaVersion: 1, migrate: value => value }), null);
});
