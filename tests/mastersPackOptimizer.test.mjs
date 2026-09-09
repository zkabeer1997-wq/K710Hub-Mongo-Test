import test from "node:test";
import assert from "node:assert/strict";
import { optimizeMastersPacks } from "../lib/mastersPackOptimizer.mjs";

test("returns no purchases when inventory covers the goal", () => {
  const resources = { supply: 30, emblems: 16, affinity: 16000, manuscripts: 1000 };
  const result = optimizeMastersPacks({ need: resources, have: resources });
  assert.equal(result.covered, true);
  assert.equal(result.cost, 0);
});

test("uses an Acuity choice when its monthly value beats the regular pack", () => {
  const result = optimizeMastersPacks({ need: { emblems: 16 }, maxMonths: 1 });
  assert.equal(result.cost, 4.99);
  assert.equal(result.schedule[0].acuity[0].resource, "emblems");
});

test("respects one Acuity purchase per tier in each month", () => {
  const result = optimizeMastersPacks({ need: { supply: 300, emblems: 160, affinity: 88000, manuscripts: 5000 }, maxMonths: 2 });
  assert.ok(result && !result.infeasible && !result.timedOut);
  for (let month = 1; month <= result.months; month++) {
    const purchases = result.schedule.filter(week => week.month === month).flatMap(week => week.acuity);
    assert.equal(new Set(purchases.map(pack => pack.tier)).size, purchases.length);
  }
});

test("respects one regular pack per resource and tier each week", () => {
  const result = optimizeMastersPacks({ need: { supply: 1000, emblems: 300, affinity: 200000, manuscripts: 30000 }, maxMonths: 2 });
  assert.ok(result && !result.infeasible && !result.timedOut);
  for (const week of result.schedule) {
    const keys = week.regular.map(pack => `${pack.resource}:${pack.tier}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("scheduled Masters purchases reconcile to cost, delivery, and cadence", () => {
  const result = optimizeMastersPacks({
    need: { supply: 1000, emblems: 300, affinity: 200000, manuscripts: 30000 },
    maxMonths: 2,
  });
  const purchases = result.schedule.flatMap(week => [...week.acuity, ...week.regular]);
  assert.ok(Math.abs(purchases.reduce((sum, pack) => sum + pack.price, 0) - result.cost) < 1e-7);
  for (const resource of ["supply", "emblems", "affinity", "manuscripts"]) {
    assert.ok(purchases.filter(pack => pack.resource === resource).reduce((sum, pack) => sum + pack.amount, 0) >= result.shortfall[resource]);
  }
  for (const week of result.schedule) {
    const regularKeys = week.regular.map(pack => `${pack.resource}:${pack.tier}`);
    assert.equal(new Set(regularKeys).size, regularKeys.length);
  }
  for (let month = 1; month <= result.months; month++) {
    const tiers = result.schedule.filter(week => week.month === month).flatMap(week => week.acuity).map(pack => pack.tier);
    assert.equal(new Set(tiers).size, tiers.length);
  }
});
