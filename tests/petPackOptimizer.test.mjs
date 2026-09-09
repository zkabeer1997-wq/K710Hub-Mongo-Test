import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizePetPacks } from '../lib/petPackOptimizer.mjs';

test('returns no-purchase result when inventory covers the target', () => {
  const result = optimizePetPacks({ need: { food: 10, manual: 2, potion: 1, medal: 1 }, have: { food: 10, manual: 2, potion: 1, medal: 1 } });
  assert.equal(result.cost, 0); assert.equal(result.weeks, 0);
});

test('uses additional weekly sets when the common tier is sufficient over time', () => {
  const result = optimizePetPacks({ need: { food: 36000, manual: 0, potion: 0, medal: 0 }, have: {}, maxWeeks: 4 });
  assert.ok(result); assert.ok(result.weeks <= 4); assert.ok(result.schedule.length === result.weeks);
});

test('never schedules a tier more than once in one week', () => {
  const result = optimizePetPacks({ need: { food: 150000, manual: 500, potion: 160, medal: 80 }, have: {}, maxWeeks: 8 });
  assert.ok(result);
  for (const week of result.schedule) {
    const customTiers = week.custom.map(x => x.tier);
    assert.equal(new Set(customTiers).size, customTiers.length);
  }
});

test('does not tell members to redeem Advanced Chests they do not need', () => {
  const result = optimizePetPacks({
    need: { food: 0, manual: 1, potion: 0, medal: 0 },
    have: {},
    ownedChests: 10,
    maxWeeks: 1,
  });
  assert.equal(result.cost, 0);
  assert.deepEqual(result.resourcePlan.allocations, { manual: 1, potion: 0, medal: 0 });
  assert.equal(result.resourcePlan.unusedChests, 9);
});

test('scheduled pet purchases reconcile to the optimizer cost and limits', () => {
  const result = optimizePetPacks({
    need: { food: 150000, manual: 500, potion: 160, medal: 80 },
    have: {},
    maxWeeks: 8,
  });
  const scheduledCost = result.schedule.flatMap((week) => [...week.custom, ...week.singles])
    .reduce((sum, pack) => sum + pack.price, 0);
  assert.ok(Math.abs(scheduledCost - result.cost) < 1e-7);
  for (const week of result.schedule) {
    assert.equal(new Set(week.custom.map((pack) => pack.tier)).size, week.custom.length);
    const singleKeys = week.singles.map((pack) => `${pack.resource}:${pack.tier}`);
    assert.equal(new Set(singleKeys).size, singleKeys.length);
  }
});
