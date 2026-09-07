import assert from "node:assert/strict";
import { test } from "node:test";
import {
  probabilityAtLeast,
  probabilityExactly,
} from "../lib/waveboundProbability.mjs";

test("binomial distribution sums to one for every practical merge count", () => {
  for (let merges = 0; merges <= 30; merges++) {
    const total = Array.from({ length: merges + 1 }, (_, majestic) =>
      probabilityExactly(merges, majestic),
    ).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  }
});

test("confidence boundaries include guaranteed and impossible outcomes", () => {
  for (const confidence of [0.5, 0.75, 0.9, 0.95, 0.99, 1])
    assert.ok(probabilityAtLeast(12, 0) >= confidence);
  assert.equal(probabilityAtLeast(12, 13), 0);
  assert.equal(probabilityAtLeast(12, 12), 0.25 ** 12);
  assert.equal(probabilityAtLeast(0, 0), 1);
});
