import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGovernorGearPlan,
  calculateHeroGearPlan,
  calculateMasterPlan,
  calculatePetProgression,
  planTtgProduction,
  rankCharmUpgrades,
} from "../lib/progressionPhase2.mjs";

test("TTG planner blocks calculation when recipes are explicitly absent", () => {
  assert.equal(
    planTtgProduction({ horizonDays: 7 }, []).status,
    "missing-data",
  );
});

test("TTG planner preserves reserve and applies daily half cost", () => {
  const result = planTtgProduction(
    {
      trueGold: 100,
      dailyIncome: 10,
      reserve: 50,
      horizonDays: 3,
      refinementState: 1,
      completedToday: 0,
      requiredTempered: 12,
      riskMode: "guaranteed",
    },
    [
      {
        state: 1,
        inputTrueGold: 20,
        outputMin: 4,
        outputExpected: 5,
        dailyLimit: 2,
      },
    ],
  );
  assert.equal(result.earliestDay, 3);
  assert.equal(result.schedule[0].trueGoldSpent, 10);
  assert.ok(result.schedule.every((day) => day.trueGoldRemaining >= 50));
});

test("hero gear maps helmet to lethality and exposes reforge recovery",()=>{const result=calculateHeroGearPlan([{label:"Infantry Helmet",tier:"Gold",enhancement:0}],{xp:60000,mithril:10,mythicPieces:5});assert.equal(result.recommendation.stat,"Lethality");assert.equal(result.reforging.forgehammerRecovery,.5);});
test("governor gear totals target path",()=>{const result=calculateGovernorGearPlan([{label:"Helmet",tier:"Green",targetTier:"Green II"}],{});assert.equal(result.totals.satin,3800);assert.equal(result.shortfall.threads,40);});
test("master plan returns next relationship milestone",()=>{const result=calculateMasterPlan({relationshipProgress:20,affinity:100});assert.equal(result.target.level,30);assert.equal(result.shortfall.affinity,660);});

test("pet progression totals verified rows and current inventory shortfalls", () => {
  const result = calculatePetProgression(
    {
      pet: "Wolf",
      generation: 1,
      currentLevel: 1,
      targetLevel: 3,
      inventory: { food: 3 },
    },
    [
      { pet: "Wolf", generation: 1, fromLevel: 1, toLevel: 2, food: 5 },
      { pet: "Wolf", generation: 1, fromLevel: 2, toLevel: 3, food: 7 },
    ],
  );
  assert.equal(result.totals.food, 12);
  assert.equal(result.shortfall.food, 9);
});

test("charm ranking honors priorities, inventory, and sequential levels", () => {
  const charms = [
    { id: "i1", type: "Infantry", current: 0, target: 2 },
    { id: "a1", type: "Archer", current: 0, target: 1 },
  ];
  const result = rankCharmUpgrades(
    charms,
    [null, [2, 2], [3, 3]],
    { guides: 4, designs: 4 },
    { troops: { Infantry: 3, Archer: 1 }, stats: {} },
  );
  assert.deepEqual(
    result.upgrades.map((item) => `${item.id}:${item.level}`),
    ["i1:1", "a1:1"],
  );
  assert.equal(result.remaining.guides, 0);
});
