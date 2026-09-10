import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { calculateUpdatedConstruction, exportUpdatedConstructionCsv } from "../lib/updatedConstruction.mjs";
import { UPDATED_CONSTRUCTION_BUILDINGS } from "../lib/updatedConstructionData.mjs";
import { planTtgProduction } from "../lib/progressionPhase2.mjs";

const all = UPDATED_CONSTRUCTION_BUILDINGS.map((building) => ({ id: building.id, current: "30", target: "TG10" }));

test("updated construction data reproduces the supplied workbook totals", () => {
  const result = calculateUpdatedConstruction(all, {}, { horizonDays: 1 }, { includePrerequisites: false });
  assert.equal(result.steps.length, 80);
  assert.deepEqual(result.totals, { trueGold: 39694, temperedTrueGold: 2956 });
  const townCenter = calculateUpdatedConstruction([{ id: "town-center", current: "30", target: "TG10" }], {}, { horizonDays: 1 }, { includePrerequisites: false });
  assert.deepEqual(townCenter.totals, { trueGold: 11610, temperedTrueGold: 870 });
  assert.equal(createHash("sha256").update(JSON.stringify(UPDATED_CONSTRUCTION_BUILDINGS)).digest("hex"), "30664e960e85ef591f13f2a750ebb0d45eebbe0579863d689834fe6ece3cfb3a");
});

test("known Town Center prerequisites are included without guessing TG9 or TG10", () => {
  const known = calculateUpdatedConstruction([{ id: "town-center", current: "TG7", target: "TG8" }], {}, { horizonDays: 1 });
  assert.ok(known.steps.some((step) => step.buildingId === "embassy" && step.to === "TG7"));
  assert.ok(known.steps.some((step) => step.buildingId === "stable" && step.to === "TG7"));
  assert.equal(known.warnings.length, 0);
  const unknown = calculateUpdatedConstruction([{ id: "town-center", current: "TG8", target: "TG10" }], {}, { horizonDays: 1 });
  assert.equal(unknown.warnings.length, 2);
});

test("construction targets sum only transitions after the current tier", () => {
  const result = calculateUpdatedConstruction([
    { id: "town-center", current: "TG5", target: "TG7" },
    { id: "embassy", current: "TG6", target: "TG7" },
  ], { trueGold: 1500, temperedTrueGold: 50 }, { horizonDays: 1 }, { includePrerequisites: false });
  assert.deepEqual(result.totals, { trueGold: 2250, temperedTrueGold: 169 });
  assert.deepEqual(result.shortfall, { trueGold: 750, temperedTrueGold: 119 });
  assert.equal(result.steps.length, 3);
});

test("refining ladder resets at the start of Monday", () => {
  const result = planTtgProduction({
    trueGold: 10000,
    horizonDays: 2,
    refinementState: 100,
    refinementsPerDay: 2,
    startWeekday: 0,
    riskMode: "guaranteed",
  });
  assert.equal(result.schedule[0].runs, 1);
  assert.equal(result.schedule[1].runs, 2);
  assert.equal(result.schedule[1].attemptAfter, 3);
});

test("refining protects construction TG and CSV exports the ordered plan", () => {
  const result = calculateUpdatedConstruction(
    [{ id: "town-center", current: "TG5", target: "TG6" }],
    { trueGold: 1000, temperedTrueGold: 0 },
    { reserve: 50, horizonDays: 1, refinementState: 1, refinementsPerDay: 2, riskMode: "guaranteed" },
    { includePrerequisites: false },
  );
  assert.equal(result.refining.protectedTrueGold, 950);
  assert.equal(result.refining.schedule[0].runs, 2);
  assert.equal(result.refining.schedule[0].trueGoldRemaining, 970);
  assert.match(exportUpdatedConstructionCsv(result), /"Town Center"/);
  assert.match(exportUpdatedConstructionCsv(result), /"TOTAL"/);
});

test("refining stops after the target and does nothing when TTG is already covered", () => {
  const reached = planTtgProduction({ trueGold: 1000, requiredTempered: 1, horizonDays: 3, refinementsPerDay: 10, riskMode: "guaranteed", stopAtTarget: true });
  assert.equal(reached.schedule[0].runs, 1);
  assert.equal(reached.schedule[1].runs, 0);
  const covered = planTtgProduction({ trueGold: 1000, temperedTrueGold: 5, requiredTempered: 5, horizonDays: 2, refinementsPerDay: 10, riskMode: "guaranteed", stopAtTarget: true });
  assert.ok(covered.schedule.every((day) => day.runs === 0));
  assert.equal(covered.finalTrueGold, 1000);
});
