import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CHARM_LEVELS,
  GOVERNOR_GEAR_LEVELS,
  HERO_MASTERY_COSTS,
  PET_FOOD_COSTS,
} from "../lib/phase2Data.mjs";
import { MASTER_LEVEL_DATA } from "../lib/mastersLevelCalculator.mjs";
import { calculateHeroGearPlan } from "../lib/progressionPhase2.mjs";
import { optimizeCharmPacks } from "../lib/charmPackOptimizer.mjs";
import { CHARM_PACKS } from "../lib/charmToolData.mjs";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("updated-tool source tables match the fully reconciled fixtures", () => {
  assert.equal(digest(PET_FOOD_COSTS), "ae3c29450ab2c31fef848b1ed86cdf0a92dfa9ab9f0cdc858464cd6c48bcc484");
  assert.equal(digest(GOVERNOR_GEAR_LEVELS), "0d84b98b7c907c44aec83c48335bb1a59306973a66f08c2af2e4911477a19eae");
  assert.equal(digest(CHARM_LEVELS), "f648b658d56b3bc0b054ed51065e0cc06c6409dde0e1aea258ff77b3bee7f474");
  assert.equal(digest(HERO_MASTERY_COSTS), "9c3e05a19df7d29436eb4e116c6c8419ce01bf805164211bd201f0d616d1fe0b");
  const affinity = Object.fromEntries(Object.entries(MASTER_LEVEL_DATA).map(([name, data]) => [name, data.affinity]));
  assert.equal(digest(affinity), "9349a97cdedefdcf4d98a0a609f3bf5d4831bdfd264a23d33ea554248f1b4e8c");
});

test("Hero Gear enforces rarity caps and the Red ascension Mastery gate", () => {
  const epic = calculateHeroGearPlan(
    [{ id: "epic", label: "Infantry Helmet", tier: "Epic", enhancement: 80, mastery: 0 }],
    { xp: 100000, forgehammers: 0, mythicPieces: 0, mithril: 0, safeXpReforging: false },
  );
  assert.equal(epic.used.xp, 0);
  const blocked = calculateHeroGearPlan(
    [{ id: "mythic", label: "Infantry Helmet", tier: "Mythic", enhancement: 100, mastery: 9 }],
    { xp: 0, forgehammers: 0, mythicPieces: 2, mithril: 0, safeXpReforging: false },
  );
  assert.equal(blocked.actions.some((action) => action.level === 101), false);
  const eligible = calculateHeroGearPlan(
    [{ id: "mythic", label: "Infantry Helmet", tier: "Mythic", enhancement: 100, mastery: 10 }],
    { xp: 0, forgehammers: 0, mythicPieces: 2, mithril: 0, safeXpReforging: false },
  );
  assert.equal(eligible.actions.some((action) => action.level === 101 && action.mythic === 2), true);
});

test("Charm purchase optimizer distinguishes lowest-cost and fastest plans", () => {
  const packs = [
    { price: 1, g: 20, d: 22, choices: 1, max: 1 },
    { price: 10, g: 200, d: 220, choices: 1, max: 1 },
  ];
  const cheapest = optimizeCharmPacks({ packs, required: { g: 100, d: 0 }, owned: {}, maxWeeks: 5, objective: "lowest-cost" });
  const fastest = optimizeCharmPacks({ packs, required: { g: 100, d: 0 }, owned: {}, maxWeeks: 5, objective: "fastest" });
  assert.equal(cheapest.costCents, 500);
  assert.equal(cheapest.weeks, 5);
  assert.equal(fastest.costCents, 1000);
  assert.equal(fastest.weeks, 1);
});

test("Charm purchase totals report inventory remaining after the upgrades", () => {
  const plan = optimizeCharmPacks({ packs: CHARM_PACKS, required: { g: 40, d: 15 }, owned: { g: 10, d: 5 }, maxWeeks: 2 });
  assert.equal(plan.covered, undefined);
  assert.ok(plan.purchased.g + 10 >= 40);
  assert.ok(plan.purchased.d + 5 >= 15);
  assert.deepEqual(plan.remaining, { g: plan.purchased.g + 10 - 40, d: plan.purchased.d + 5 - 15 });
  assert.equal(Number.isInteger(plan.costCents), true);
  const covered = optimizeCharmPacks({ packs: CHARM_PACKS, required: { g: 5, d: 5 }, owned: { g: 20, d: 22 } });
  assert.equal(covered.covered, true);
  assert.deepEqual(covered.remaining, { g: 15, d: 17 });
  assert.equal(covered.weeks, 0);
});
