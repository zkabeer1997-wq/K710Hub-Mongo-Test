import test from "node:test";
import assert from "node:assert/strict";
import { optimizePetPacks } from "../lib/petPackOptimizer.mjs";

test("returns no-purchase result when inventory covers the target", () => {
  const result = optimizePetPacks({
    need: { food: 10, manual: 2, potion: 1, medal: 1 },
    have: { food: 10, manual: 2, potion: 1, medal: 1 },
  });
  assert.equal(result.cost, 0);
  assert.equal(result.weeks, 0);
});

test("uses additional weekly sets when the common tier is sufficient over time", () => {
  const result = optimizePetPacks({
    need: { food: 36000, manual: 0, potion: 0, medal: 0 },
    have: {},
    maxWeeks: 4,
  });
  assert.ok(result);
  assert.ok(result.weeks <= 4);
  assert.ok(result.schedule.length === result.weeks);
});

test("never schedules a tier more than once in one week", () => {
  const result = optimizePetPacks({
    need: { food: 150000, manual: 500, potion: 160, medal: 80 },
    have: {},
    maxWeeks: 8,
  });
  assert.ok(result);
  for (const week of result.schedule) {
    const customTiers = week.custom.map((x) => x.tier);
    assert.equal(new Set(customTiers).size, customTiers.length);
  }
});

test("labels a completed exhaustive search and reports nonnegative surplus", () => {
  const result = optimizePetPacks({
    need: { food: 1000, manual: 1, potion: 1, medal: 1 },
    have: {},
    maxWeeks: 1,
  });
  assert.equal(result.optimal, true);
  assert.deepEqual(Object.keys(result.surplus).sort(), [
    "food",
    "manual",
    "medal",
    "potion",
  ]);
  assert.ok(Object.values(result.surplus).every((value) => value >= 0));
});

test("honors total and weekly spending caps", () => {
  const need = { food: 100000, manual: 300, potion: 100, medal: 50 };
  const baseline = optimizePetPacks({
    need,
    have: {},
    ownedChests: 0,
    maxWeeks: 4,
  });
  assert.ok(baseline.cost > 0);
  const capped = optimizePetPacks({
    need,
    have: {},
    ownedChests: 0,
    maxWeeks: 4,
    budgetCap: baseline.cost - 0.01,
  });
  assert.equal(capped.infeasible, true);
  const weekly = optimizePetPacks({
    need,
    have: {},
    ownedChests: 0,
    maxWeeks: 8,
    maxWeeklySpend: 50,
  });
  if (!weekly.infeasible) assert.ok(weekly.maxWeekCost <= 50.000001);
});
