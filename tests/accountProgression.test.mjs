import test from "node:test";
import assert from "node:assert/strict";
import {
  accountPlanCsv,
  accountPlanDiscord,
  buildAccountOpportunities,
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
