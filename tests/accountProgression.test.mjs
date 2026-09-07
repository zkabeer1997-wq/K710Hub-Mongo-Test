import test from "node:test";
import assert from "node:assert/strict";
import {
  accountPlanCsv,
  accountPlanDiscord,
  buildAccountOpportunities,
  calculateKvkPrepSchedule,
  rankAccountProgression,
} from "../lib/accountProgression.mjs";
import { isSupportedToolKey } from "../lib/toolKeys.mjs";

const candidate = (id, system, feasible = true) => ({
  id,
  system,
  systemLabel: system,
  title: `${id} action`,
  benefit: `${id} benefit`,
  feasible,
  days: 1,
  resources: feasible ? {} : { Stone: 100 },
  shortfall: feasible ? {} : { Stone: 50 },
  rationale: `${id} reason`,
});

test("account progression uses saved source-planner state without mutating it", () => {
  const savedStates = {
    "hero-gear": {
      envelopeVersion: 1,
      inputs: {
        rows: [
          {
            id: "i-h",
            label: "Infantry Helmet",
            tier: "Mythic",
            enhancement: 0,
            mastery: 0,
          },
        ],
        xp: 100,
        forgehammers: 0,
        mythicPieces: 0,
        mithril: 0,
      },
    },
  };
  const before = structuredClone(savedStates);
  const opportunities = buildAccountOpportunities({ savedStates });
  assert.equal(opportunities[0].system, "heroGear");
  assert.equal(opportunities[0].sourceToolKey, "hero-gear");
  assert.deepEqual(savedStates, before);
});

test("member weights deterministically change cross-system ordering", () => {
  const opportunities = [
    candidate("hero", "heroGear"),
    candidate("research", "academy"),
  ];
  const heroFirst = rankAccountProgression(opportunities, {
    goal: "custom",
    systemWeights: { heroGear: 3, academy: 1 },
  });
  const researchFirst = rankAccountProgression(opportunities, {
    goal: "custom",
    systemWeights: { heroGear: 1, academy: 3 },
  });
  assert.equal(heroFirst.selected[0].id, "hero");
  assert.equal(researchFirst.selected[0].id, "research");
});

test("unfunded actions can be excluded and create explicit bottlenecks", () => {
  const opportunities = [
    candidate("ready", "pets"),
    candidate("blocked", "construction", false),
  ];
  const excluded = rankAccountProgression(opportunities, {
    includeInfeasible: false,
  });
  assert.deepEqual(
    excluded.ranked.map((item) => item.id),
    ["ready"],
  );
  const included = rankAccountProgression(opportunities, {
    includeInfeasible: true,
  });
  assert.deepEqual(included.bottlenecks, [
    { system: "construction", resource: "Stone", amount: 50 },
  ]);
});

test("manual targets remain explicitly manual and do not infer resources", () => {
  const [manual] = buildAccountOpportunities({
    manual: [{ system: "pets", title: "Save for new pet" }],
  });
  assert.equal(manual.verifiedStatus, "manual");
  assert.deepEqual(manual.resources, {});
  assert.match(manual.rationale, /no game value was inferred/i);
});

test("sensitivity and exports remain usable and spreadsheet-safe", () => {
  const plan = rankAccountProgression([candidate("=formula", "charms")], {});
  assert.deepEqual(plan.sensitivity[0], {
    id: "=formula",
    title: "=formula action",
    minRank: 1,
    maxRank: 1,
    stable: true,
  });
  assert.match(accountPlanCsv(plan), /"'formula action"/);
  assert.match(accountPlanDiscord(plan), /K710 Account Progression Plan/);
});

test("account progression is a supported persisted tool", () => {
  assert.equal(isSupportedToolKey("account-progression"), true);
});

test("KvK schedule assigns actions to the preferred scoring day", () => {
  const action = {
    ...candidate("charm", "charms"),
    kvkScoring: [1, 3, 4].map((day) => ({
      day,
      points: 7000,
      preferred: day === 1,
      formula: "100 max score × 70",
    })),
  };
  const schedule = calculateKvkPrepSchedule([action], {
    kvkStartDate: "2026-09-07",
    dailyChestTarget: 200000,
  });
  assert.equal(schedule.days[0].actions[0].id, "charm");
  assert.equal(schedule.days[0].points, 7000);
  assert.equal(schedule.days[0].date, "2026-09-07");
  assert.deepEqual(schedule.days[0].actions[0].alternativeDays, [3, 4]);
});

test("best-stat objective compares percentage-point gains with editable weights", () => {
  const health = {
    ...candidate("health", "charms"),
    statDimensions: [{ key: "health", label: "Health", value: 5 }],
  };
  const attack = {
    ...candidate("attack", "masters"),
    statDimensions: [{ key: "attack", label: "Attack", value: 3 }],
  };
  const plan = rankAccountProgression([health, attack], {
    objective: "stats",
    goal: "custom",
    statWeights: { health: 1, attack: 2 },
  });
  assert.equal(plan.selected[0].id, "attack");
  assert.equal(plan.selected[0].statScore, 6);
  assert.match(plan.methodology, /percentage-point stat gain/i);
});

test("pet timing is shown without inventing an unavailable advancement score", () => {
  const opportunities = buildAccountOpportunities({
    savedStates: {
      "pet-progression": {
        pet: "Gray Wolf",
        generation: 1,
        currentLevel: 9,
        targetLevel: 10,
        inventory: { food: 1000, manuals: 15 },
      },
    },
  });
  const schedule = calculateKvkPrepSchedule(opportunities);
  assert.equal(schedule.days[2].actions[0].kvkPoints, null);
  assert.match(
    schedule.days[2].actions[0].kvkFormula,
    /withheld|does not include/i,
  );
});

test("additional KvK inventory produces exact daily point subtotals", () => {
  const schedule = calculateKvkPrepSchedule([], {
    kvkInventory: {
      intelMissions: 10,
      advancedTamingMarks: 4,
      troopTier: 11,
      troopCount: 1000,
    },
  });
  assert.equal(schedule.days[0].points, 60000);
  assert.equal(schedule.days[2].points, 60000);
  assert.equal(schedule.days[3].points, 75000);
  assert.equal(schedule.totalExactPoints, 195000);
});
