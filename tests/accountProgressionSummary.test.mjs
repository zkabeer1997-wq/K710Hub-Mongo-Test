import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountSummaries, buildLegacyMigrationCandidates, buildProgressionOverview } from "../lib/accountProgressionSummary.mjs";

const record = (toolKey, inputs, updatedAt = "2026-09-10T12:00:00.000Z") => ({
  state: { envelopeVersion: 1, toolKey, schemaVersion: 1, inputs },
  updatedAt,
});

test("updated charm state supplies its exact level-specific KvK points", () => {
  const summaries = buildAccountSummaries({ sources: {
    "updated-charms": record("updated-charms", {
      charms: [{ id: "inf-1", type: "Infantry", number: 1, current: 0, target: 1 }],
      guides: 5,
      designs: 5,
      optimizationGoal: "events",
      troopWeights: { Infantry: 1 },
      statWeights: { Health: 1, Lethality: 1 },
      amplification: 1,
    }),
  } });
  const charms = summaries.find((item) => item.id === "charms");
  assert.equal(charms.legacy, false);
  assert.equal(charms.exactKvkPoints, 43750);
  assert.equal(charms.scoringStatus, "verified");
});

test("updated Governor Gear uses upgrade points instead of max-power multiplication", () => {
  const summaries = buildAccountSummaries({ sources: {
    "updated-governor-gear": record("updated-governor-gear", {
      rows: [{ id: "cap", label: "Cavalry Cap", troop: "Cavalry", tier: "" }],
      satin: 1500,
      threads: 15,
      visions: 0,
      mode: "inventory",
      optimizationGoal: "events",
      troopWeights: { Cavalry: 1 },
      amplification: 1,
    }),
  } });
  const governor = summaries.find((item) => item.id === "governorGear");
  assert.equal(governor.exactKvkPoints, 40500);
  assert.equal(governor.scoringStatus, "verified");
});

test("updated state takes precedence and legacy-only state is clearly excluded", () => {
  const both = buildAccountSummaries({ sources: {
    "updated-charms": record("updated-charms", { charms: [] }),
    "governor-charm-stats": record("governor-charm-stats", { charms: [] }),
  } }).find((item) => item.id === "charms");
  assert.equal(both.sourceKey, "updated-charms");
  assert.equal(both.legacy, false);

  const legacy = buildAccountSummaries({ sources: {
    "governor-charm-stats": record("governor-charm-stats", { charms: [] }),
  } });
  const overview = buildProgressionOverview(legacy);
  assert.equal(overview.legacy.length, 1);
  assert.equal(overview.actionable.length, 0);
});

test("zero is a valid daily KvK target", () => {
  const overview = buildProgressionOverview([], { dailyTarget: 0 });
  assert.equal(overview.days[0].target, 0);
  assert.equal(overview.days[0].covered, true);
});

test("unknown point systems never enter the exact total", () => {
  const overview = buildProgressionOverview([{ id: "pets", label: "Pets", status: "connected", legacy: false, nextAction: {}, affordable: true, exactKvkPoints: null, scoringStatus: "unavailable", eligibleKvkDays: [3], shortfall: {} }], { objective: "kvk" });
  assert.equal(overview.exactKvkPoints, 0);
  assert.equal(overview.days[2].exactPoints, 0);
});

test("compatible legacy plans migrate without overwriting an Updated Tool", () => {
  const legacyInputs = { rows: [{ id: "cap" }], satin: 20, unknownFutureField: "preserved" };
  const candidates = buildLegacyMigrationCandidates({
    "governor-gear": record("governor-gear", legacyInputs),
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].to, "updated-governor-gear");
  assert.equal(candidates[0].state.schemaVersion, 2);
  assert.deepEqual(candidates[0].state.inputs, legacyInputs);

  assert.deepEqual(buildLegacyMigrationCandidates({
    "governor-gear": record("governor-gear", legacyInputs),
    "updated-governor-gear": record("updated-governor-gear", { satin: 1 }),
  }), []);
});

test("incompatible retired single-entity plans are not guessed", () => {
  assert.deepEqual(buildLegacyMigrationCandidates({
    masters: record("masters", { master: "Valora" }),
    "pet-progression": record("pet-progression", { pet: "Gray Wolf" }),
  }), []);
});
