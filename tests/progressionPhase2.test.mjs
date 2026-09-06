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

test("TTG planner stops at attempt 100 until the Monday reset", () => {
  const result = planTtgProduction({
    trueGold: 10000,
    horizonDays: 2,
    refinementState: 100,
    refinementsPerDay: 5,
    startWeekday: 2,
    riskMode: "guaranteed",
  });
  assert.equal(result.schedule[0].runs, 1);
  assert.equal(result.schedule[1].runs, 0);
});

test("pet progression charges advancement materials on milestone levels", () => {
  const result = calculatePetProgression({
    pet: "Gray Wolf",
    generation: 1,
    currentLevel: 9,
    targetLevel: 10,
    inventory: {},
  });
  assert.equal(result.totals.manuals, 15);
  assert.equal(result.advancedChestEquivalents, 3);
});

test("hero gear maps helmet to lethality and exposes reforge recovery", () => {
  const result = calculateHeroGearPlan(
    [{ label: "Infantry Helmet", tier: "Gold", enhancement: 0 }],
    { xp: 60000, mithril: 10, mythicPieces: 5 },
  );
  assert.equal(result.recommendation.stat, "Lethality");
  assert.equal(result.reforging.forgehammerRecovery, 0.5);
});
test("hero gear never recommends an unaffordable upgrade", () => {
  const result = calculateHeroGearPlan(
    [{ id: "i-h", label: "Infantry Helmet", tier: "Mythic", enhancement: 0 }],
    { xp: 0, forgehammers: 0, mythicPieces: 0, mithril: 0 },
  );
  assert.equal(result.recommendation, null);
  assert.equal(result.used.xp, 0);
  assert.equal(result.actions.length, 0);
});

test("hero XP allocation matches the published 10,000 XP reference fixture", () => {
  const weights = {
    "Infantry.Health": 1.5,
    "Infantry.Lethality": 0.7,
    "Cavalry.Health": 0.2,
    "Cavalry.Lethality": 0.4,
    "Archer.Health": 0.7,
    "Archer.Lethality": 1.4,
  };
  const rows = ["Infantry", "Cavalry", "Archer"].flatMap((troop) =>
    ["Helmet", "Gloves", "Chest", "Boots"].map((slot) => ({
      id: `${troop}-${slot}`,
      label: `${troop} ${slot}`,
      troop,
      tier: "Mythic",
      enhancement: 0,
      mastery: 0,
    })),
  );
  const result = calculateHeroGearPlan(rows, {
    xp: 10000,
    gearWeights: weights,
  });
  assert.equal(result.used.xp, 10000);
  assert.deepEqual(
    Object.fromEntries(
      result.candidates.map((item) => [item.id, item.targetLevel]),
    ),
    {
      "Infantry-Helmet": 12,
      "Infantry-Gloves": 27,
      "Infantry-Chest": 27,
      "Infantry-Boots": 12,
      "Cavalry-Helmet": 7,
      "Cavalry-Gloves": 2,
      "Cavalry-Chest": 3,
      "Cavalry-Boots": 6,
      "Archer-Helmet": 26,
      "Archer-Gloves": 12,
      "Archer-Chest": 12,
      "Archer-Boots": 26,
    },
  );
});
test("governor gear totals target path", () => {
  const result = calculateGovernorGearPlan(
    [{ label: "Helmet", tier: "Green", targetTier: "Green II" }],
    {},
  );
  assert.equal(result.totals.satin, 3800);
  assert.equal(result.shortfall.threads, 40);
});
test("master plan returns next relationship milestone", () => {
  const result = calculateMasterPlan({
    relationshipProgress: 20,
    affinity: 100,
  });
  assert.equal(result.target.level, 30);
  assert.equal(result.shortfall.affinity, 660);
});

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

test("charm allocation matches both published bottleneck fixtures", () => {
  const charms = ["Infantry", "Cavalry", "Archer"].flatMap((type) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `${type}-${index + 1}`,
      type,
      number: index + 1,
      current: 0,
      target: 22,
    })),
  );
  const weights = {
    troops: { Infantry: 2.2, Cavalry: 0.6, Archer: 2.1 },
    stats: { Health: 1, Lethality: 1 },
    amplification: 1.25,
  };
  const designsLimited = rankCharmUpgrades(
    charms,
    [null, [5, 5], [40, 15], [60, 40]],
    { guides: 5000, designs: 500 },
    weights,
  );
  assert.deepEqual(
    [
      designsLimited.upgrades.length,
      designsLimited.totals.guides,
      designsLimited.totals.designs,
    ],
    [39, 990, 480],
  );
  const guidesLimited = rankCharmUpgrades(
    charms,
    [null, [5, 5], [40, 15], [60, 40]],
    { guides: 500, designs: 5000 },
    weights,
  );
  assert.deepEqual(
    [
      guidesLimited.upgrades.length,
      guidesLimited.totals.guides,
      guidesLimited.totals.designs,
    ],
    [28, 490, 240],
  );
});

test("governor inventory allocation matches the reference fixture", () => {
  const rows = ["Cavalry", "Infantry", "Archer"].flatMap((troop) =>
    [1, 2].map((piece) => ({
      id: `${troop}-${piece}`,
      label: `${troop} ${piece}`,
      troop,
      tier: "",
    })),
  );
  const result = calculateGovernorGearPlan(rows, {
    mode: "inventory",
    satin: 100000,
    threads: 1000,
    visions: 200,
    troopWeights: { Infantry: 2.2, Cavalry: 0.6, Archer: 2.1 },
    amplification: 1.25,
  });
  assert.deepEqual(
    [
      result.steps.length,
      result.totals.satin,
      result.totals.threads,
      result.totals.visions,
    ],
    [24, 97700, 985, 200],
  );
});
