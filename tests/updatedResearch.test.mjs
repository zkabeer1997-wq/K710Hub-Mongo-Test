import assert from "node:assert/strict";
import test from "node:test";
import academy from "../lib/data/academy.json" with { type: "json" };
import warAcademy from "../lib/data/war-academy.json" with { type: "json" };
import advanced from "../lib/data/advanced-research.json" with { type: "json" };
import { calculateCosts } from "../lib/costPlanner.mjs";
import { ADVANCED_WORKBOOK_SUMMARY, RESEARCH_DATA_COUNTS, WAR_ACADEMY_WORKBOOK_SUMMARY } from "../lib/updatedResearchData.mjs";

test("unified research datasets contain only verified per-level records", () => {
  for (const [key, dataset, expected] of [["academy", academy, RESEARCH_DATA_COUNTS.academy], ["warAcademy", warAcademy, RESEARCH_DATA_COUNTS.warAcademy], ["advanced", advanced, RESEARCH_DATA_COUNTS.advanced]]) {
    assert.equal(dataset.items.length, expected.technologies, key);
    const levels = dataset.items.flatMap((item) => item.levels);
    assert.equal(levels.length, expected.levels, key);
    assert.equal(levels.every((level) => level.verified === true), true, key);
  }
});

test("War Academy workbook checkpoints remain exact", () => {
  assert.deepEqual(WAR_ACADEMY_WORKBOOK_SUMMARY.buildingStages[4], ["TG5", 750, 0, "2.50%", "Unlocks the full T11 path"]);
  assert.deepEqual(WAR_ACADEMY_WORKBOOK_SUMMARY.buildingStages.at(-1), ["TG10", 706, 187, "15.00%", ""]);
  const battalion = warAcademy.items.find((item) => item.id === "infantry-truegold-battalion");
  const result = calculateCosts(warAcademy, { selections: [{ id: battalion.id, current: "0", target: "5" }], currentLevels: {}, inventory: {}, modifiers: {}, includePrerequisites: false, kind: "research" });
  assert.equal(result.totals.truegold_dust, 258);
  assert.equal(result.totals.bread, 4_760_000);
  assert.equal(result.power, 300_000);
});

test("Advanced Truegold Weaponry uses exact rows and discloses the workbook total error", () => {
  const weaponry = advanced.items.find((item) => item.name === "Truegold Weaponry");
  assert.ok(weaponry);
  const result = calculateCosts(advanced, { selections: [{ id: weaponry.id, current: "0", target: "10" }], currentLevels: {}, inventory: {}, modifiers: {}, includePrerequisites: false, kind: "research" });
  assert.equal(result.totals.truegold_dust, 389);
  assert.equal(result.totals.bread, 2_900_000);
  assert.equal(result.totals.gold, 58_000);
  assert.equal(result.power, 100_000);
  assert.match(ADVANCED_WORKBOOK_SUMMARY.discrepancies[0], /2\.90M/);
  assert.match(ADVANCED_WORKBOOK_SUMMARY.discrepancies[0], /58K Gold/);
});
