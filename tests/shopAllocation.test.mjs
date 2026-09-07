import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateShopCurrency,
  maximizeCurrencyUnderBudget,
} from "../lib/shopAllocation.mjs";
import { shellPackSchedule } from "../lib/adventureStall.mjs";

test("cash allocation maximizes currency then minimizes spend and pack count", () => {
  const packs = [
    { key: "small", cents: 100, essence: 10 },
    { key: "large", cents: 180, essence: 20 },
  ];
  assert.deepEqual(
    maximizeCurrencyUnderBudget(280, { small: 2, large: 2 }, packs),
    {
      spentCents: 280,
      currency: 30,
      count: 2,
      quantities: { small: 1, large: 1 },
    },
  );
  assert.equal(
    maximizeCurrencyUnderBudget(179, { small: 2, large: 2 }, packs).currency,
    10,
  );
});

test("reward allocation honors exclusions, minimums, must-buys and stock", () => {
  const items = [
    { key: "a", essence: 10, max: 3 },
    { key: "b", essence: 20, max: 2 },
    { key: "c", essence: 5, max: 4 },
  ];
  const result = allocateShopCurrency({
    items,
    currency: 55,
    priorities: { a: 5, b: 20, c: 100 },
    excluded: { c: true },
    mustBuy: { a: true },
    minimums: { b: 1 },
  });
  assert.equal(result.feasible, true);
  assert.deepEqual(result.quantities, { a: 3, b: 1, c: 0 });
  assert.equal(result.leftover, 5);
});

test("reward allocation reports an infeasible required cart", () => {
  const result = allocateShopCurrency({
    items: [{ key: "a", shells: 30, max: 2 }],
    currency: 40,
    mustBuy: { a: true },
  });
  assert.equal(result.feasible, false);
  assert.equal(result.shortfall, 20);
});

test("daily pack schedule never exceeds a pack daily limit", () => {
  const packs = [
    { key: "a", perDay: 1 },
    { key: "b", perDay: 3 },
  ];
  const schedule = shellPackSchedule({ quantities: { a: 2, b: 5 } }, 3, packs);
  assert.deepEqual(
    schedule.map((day) => day.purchases.map((entry) => entry.quantity)),
    [
      [1, 3],
      [1, 2],
    ],
  );
});
