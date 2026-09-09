import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGovernorGearPlan,
  calculateHeroGearPlan,
  calculateMasterPlan,
  calculatePetProgression,
  buildPetRows,
  heroXpLevelCost,
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

test("pet food rows match published rarity checkpoints", () => {
  const checkpoints = [
    ["Gray Wolf", 3, 160],
    ["Gray Wolf", 10, 235],
    ["Gray Wolf", 20, 390],
    ["Gray Wolf", 50, 1320],
    ["Bison", 10, 370],
    ["Bison", 60, 3560],
    ["Moose", 30, 1650],
    ["Moose", 70, 7140],
    ["Lion", 40, 3440],
    ["Mighty Bison", 100, 23100],
  ];
  for (const [pet, level, expected] of checkpoints) {
    assert.equal(
      buildPetRows(pet).find((row) => row.toLevel === level)?.food,
      expected,
      `${pet} level ${level}`,
    );
  }
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

test("hero pack candidates expose complete costs for mastery and Red milestones", () => {
  const mastery = calculateHeroGearPlan(
    [{ id: "mastery", label: "Infantry Helmet", tier: "Mythic", enhancement: 20, mastery: 10 }],
    { xp: 0, forgehammers: 0, mythicPieces: 0, mithril: 0, safeXpReforging: false },
  );
  assert.ok(mastery.nearMisses.some((item) => item.costs.forgehammers === 110 && item.costs.mythicPieces === 1));

  const red = calculateHeroGearPlan(
    [{ id: "red", label: "Infantry Helmet", tier: "Red", enhancement: 119, mastery: 11 }],
    { xp: 0, forgehammers: 0, mythicPieces: 0, mithril: 0, safeXpReforging: false },
  );
  assert.ok(red.nearMisses.some((item) => item.costs.mithril === 10 && item.costs.mythicPieces === 3));
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

function referenceHeroRows() {
  return ["Infantry", "Cavalry", "Archer"].flatMap((troop) =>
    ["Helmet", "Gloves", "Chest", "Boots"].map((slot) => ({
      id: `${troop}-${slot}`,
      label: `${troop} ${slot}`,
      troop,
      tier: "Mythic",
      enhancement: 0,
      mastery: 0,
    })),
  );
}

const growthHeroWeights = {
  "Infantry.Health": 1.5,
  "Infantry.Lethality": 0.7,
  "Cavalry.Health": 0.2,
  "Cavalry.Lethality": 0.4,
  "Archer.Health": 0.7,
  "Archer.Lethality": 1.4,
};

test("hero XP costs match published breakpoints and cumulative totals", () => {
  assert.deepEqual(
    [1, 10, 29, 30, 40, 60, 70, 80, 100].map(heroXpLevelCost),
    [10, 55, 150, 160, 270, 680, 990, 1400, 2400],
  );
  assert.equal(
    Array.from({ length: 80 }, (_, index) => heroXpLevelCost(index + 1)).reduce(
      (sum, cost) => sum + cost,
      0,
    ),
    34820,
  );
  assert.equal(
    Array.from({ length: 100 }, (_, index) => heroXpLevelCost(index + 1)).reduce(
      (sum, cost) => sum + cost,
      0,
    ),
    73320,
  );
  assert.equal(heroXpLevelCost(120), 0);
  assert.equal(heroXpLevelCost(140), 0);
  assert.equal(heroXpLevelCost(160), 0);
  assert.equal(heroXpLevelCost(180), 0);
  assert.equal(heroXpLevelCost(200), 0);
  assert.equal(
    Array.from({ length: 200 }, (_, index) => heroXpLevelCost(index + 1)).reduce(
      (sum, cost) => sum + cost,
      0,
    ),
    574370,
  );
});

test("hero optimizer applies the exact first Red ascension milestone costs", () => {
  const result = calculateHeroGearPlan(
    [
      {
        id: "Infantry-Helmet",
        label: "Infantry Helmet",
        troop: "Infantry",
        tier: "Mythic",
        enhancement: 100,
        mastery: 10,
      },
    ],
    {
      xp: 52650,
      forgehammers: 110,
      mythicPieces: 6,
      mithril: 10,
      gearWeights: { "Infantry.Lethality": 1 },
    },
  );
  assert.deepEqual(result.used, {
    xp: 52650,
    mithril: 10,
    mythicPieces: 6,
    forgehammers: 110,
  });
  assert.equal(result.candidates[0].targetLevel, 120);
  assert.equal(result.candidates[0].targetMastery, 11);
});

test("hero optimizer safely reforges non-Red XP into a higher-value piece", () => {
  const result = calculateHeroGearPlan(
    [
      {
        id: "low",
        label: "Cavalry Gloves",
        troop: "Cavalry",
        tier: "Mythic",
        enhancement: 100,
        mastery: 0,
      },
      {
        id: "high",
        label: "Infantry Gloves",
        troop: "Infantry",
        tier: "Mythic",
        enhancement: 0,
        mastery: 0,
      },
    ],
    {
      xp: 0,
      safeXpReforging: true,
      gearWeights: { "Cavalry.Health": 0.2, "Infantry.Health": 1.5 },
    },
  );
  assert.equal(result.reforging.xpRecovered, 68680);
  assert.deepEqual(
    result.candidates.map((item) => [item.id, item.targetLevel]),
    [
      ["low", 46],
      ["high", 97],
    ],
  );
  assert.equal(result.reforging.actions[0].targetLevel, 46);
});

test("hero optimizer matches the published 20,000 XP Growth fixture", () => {
  const result = calculateHeroGearPlan(referenceHeroRows(), {
    xp: 20000,
    gearWeights: growthHeroWeights,
  });
  assert.equal(result.used.xp, 19995);
  assert.deepEqual(
    Object.fromEntries(
      result.candidates.map((item) => [item.id, item.targetLevel]),
    ),
    {
      "Infantry-Helmet": 20,
      "Infantry-Gloves": 37,
      "Infantry-Chest": 36,
      "Infantry-Boots": 20,
      "Cavalry-Helmet": 11,
      "Cavalry-Gloves": 5,
      "Cavalry-Chest": 6,
      "Cavalry-Boots": 11,
      "Archer-Helmet": 35,
      "Archer-Gloves": 20,
      "Archer-Chest": 20,
      "Archer-Boots": 35,
    },
  );
});

test("hero optimizer matches the mixed XP and Forgehammer Growth fixture", () => {
  const result = calculateHeroGearPlan(referenceHeroRows(), {
    xp: 20000,
    forgehammers: 1000,
    mythicPieces: 20,
    mithril: 10,
    gearWeights: growthHeroWeights,
  });
  assert.deepEqual(result.used, {
    xp: 19995,
    mithril: 0,
    mythicPieces: 0,
    forgehammers: 980,
  });
  assert.deepEqual(
    Object.fromEntries(
      result.candidates.map((item) => [
        item.id,
        [item.targetLevel, item.targetMastery],
      ]),
    ),
    {
      "Infantry-Helmet": [15, 0],
      "Infantry-Gloves": [39, 7],
      "Infantry-Chest": [39, 7],
      "Infantry-Boots": [15, 0],
      "Cavalry-Helmet": [8, 0],
      "Cavalry-Gloves": [3, 0],
      "Cavalry-Chest": [4, 0],
      "Cavalry-Boots": [8, 0],
      "Archer-Helmet": [38, 6],
      "Archer-Gloves": [15, 0],
      "Archer-Chest": [15, 0],
      "Archer-Boots": [37, 6],
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

test("master plan does not invent skill upgrades when targets are unchanged", () => {
  const result = calculateMasterPlan({
    master: "Valora",
    relationshipProgress: 0,
    targetRelationship: 10,
    skills: [
      { name: "Dance of the Hunt", level: 0, targetLevel: 0, partialXp: 0 },
    ],
  });
  assert.deepEqual(result.skillRoadmap, []);
  assert.equal(result.xp, 0);
  assert.equal(result.manuscripts, 0);
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

test("protected charms are excluded from recommendations", () => {
  const result = rankCharmUpgrades(
    [
      { id: "protected", type: "Infantry", current: 0, target: 2, locked: true },
      { id: "open", type: "Archer", current: 0, target: 1 },
    ],
    [null, [5, 5], [10, 10]],
    { guides: 20, designs: 20 },
    { troops: { Infantry: 3, Archer: 1 }, stats: {} },
  );
  assert.deepEqual(result.upgrades.map((item) => item.id), ["open"]);
});

test("protected Governor Gear pieces are excluded from target plans", () => {
  const result = calculateGovernorGearPlan(
    [
      { id: "helmet", label: "Helmet", tier: "", targetTier: "Green", locked: true },
      { id: "chest", label: "Chest", tier: "", targetTier: "Green" },
    ],
    { mode: "targets", satin: 99999, threads: 99999, visions: 99999 },
  );
  assert.ok(result.steps.length > 0);
  assert.ok(result.steps.every((step) => step.piece === "Chest"));
});

test("protected pets and Masters generate no progression spend", () => {
  const pet = calculatePetProgression(
    { pet: "Wolf", generation: 1, currentLevel: 1, targetLevel: 2, locked: true, inventory: {} },
    [{ pet: "Wolf", generation: 1, fromLevel: 1, toLevel: 2, food: 5 }],
  );
  assert.equal(pet.steps.length, 0);
  const master = calculateMasterPlan({
    master: "Valora",
    relationshipProgress: 5,
    targetRelationship: 10,
    locked: true,
    skills: [],
  });
  assert.equal(master.affinity, 0);
  assert.equal(master.emblems, 0);
});
