import test from "node:test";
import assert from "node:assert/strict";
import { optimizeOfferPacks } from "../lib/offerPackOptimizer.mjs";

test("custom offer optimizer finds the cheapest complete purchase", () => {
  const plan = optimizeOfferPacks([
    { name: "Small", price: 4.99, limit: 2, xp: 100, hammers: 5 },
    { name: "Large", price: 9.99, limit: 1, xp: 250, hammers: 20 },
  ], { xp: 200, hammers: 10 });
  assert.equal(plan.cost, 9.98);
  assert.deepEqual(plan.picks, [{ name: "Small", quantity: 2, price: 4.99 }]);
});

test("custom offer optimizer reports an impossible catalog", () => {
  assert.equal(optimizeOfferPacks([{ price: 1, limit: 1, satin: 2 }], { satin: 3 }), null);
});
