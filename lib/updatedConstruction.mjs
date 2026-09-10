import { CONSTRUCTION_TIERS, TOWN_CENTER_APPROXIMATE, TOWN_CENTER_PREREQUISITES, UPDATED_CONSTRUCTION_BUILDINGS } from "./updatedConstructionData.mjs";
import { planTtgProduction } from "./progressionPhase2.mjs";

const nonnegative = (value) => Math.max(0, Number(value) || 0);
const tierIndex = (value) => value === "30" || value === "" || value == null ? -1 : CONSTRUCTION_TIERS.indexOf(value);

export function calculateUpdatedConstruction(selections = [], inventory = {}, refinement = {}, options = {}) {
  const requested = new Map(selections.map((selection) => [selection.id, { ...selection }]));
  const effective = new Map(selections.map((selection) => [selection.id, { ...selection }]));
  const warnings = [];
  if (options.includePrerequisites !== false) {
    const townCenter = requested.get("town-center");
    const current = tierIndex(townCenter?.current);
    const target = tierIndex(townCenter?.target);
    for (let index = current + 1; index <= target; index += 1) {
      const targetTier = CONSTRUCTION_TIERS[index];
      const prerequisites = TOWN_CENTER_PREREQUISITES[targetTier];
      if (prerequisites?.some((item) => item.derived)) warnings.push(`${targetTier} prerequisites follow the workbook's stated Embassy + rotating troop-building pattern and are pending in-game confirmation.`);
      for (const prerequisite of prerequisites || []) {
        const selection = effective.get(prerequisite.id) || { id: prerequisite.id, current: "30", target: "30" };
        if (tierIndex(selection.target) < tierIndex(prerequisite.tier)) selection.target = prerequisite.tier;
        effective.set(prerequisite.id, selection);
      }
    }
  }
  const steps = [];
  for (const selection of effective.values()) {
    const building = UPDATED_CONSTRUCTION_BUILDINGS.find((item) => item.id === selection.id);
    if (!building) continue;
    const current = tierIndex(selection.current);
    const target = tierIndex(selection.target);
    if (target < current) throw new RangeError(`${building.name}: target tier must not be below current tier.`);
    for (let index = current + 1; index <= target; index += 1) {
      const cost = building.costs[index];
      steps.push({
        buildingId: building.id,
        building: building.name,
        priority: building.priority,
        from: index === 0 ? "30" : CONSTRUCTION_TIERS[index - 1],
        to: CONSTRUCTION_TIERS[index],
        trueGold: cost.trueGold,
        temperedTrueGold: cost.temperedTrueGold,
        reason: index > tierIndex(requested.get(building.id)?.target) ? "Town Center prerequisite" : "Selected target",
      });
    }
  }
  steps.sort((a, b) => CONSTRUCTION_TIERS.indexOf(a.to) - CONSTRUCTION_TIERS.indexOf(b.to) || a.priority - b.priority || a.building.localeCompare(b.building));
  const totals = steps.reduce((sum, step) => ({
    trueGold: sum.trueGold + step.trueGold,
    temperedTrueGold: sum.temperedTrueGold + step.temperedTrueGold,
  }), { trueGold: 0, temperedTrueGold: 0 });
  const owned = { trueGold: nonnegative(inventory.trueGold), temperedTrueGold: nonnegative(inventory.temperedTrueGold) };
  const shortfall = {
    trueGold: Math.max(0, totals.trueGold - owned.trueGold),
    temperedTrueGold: Math.max(0, totals.temperedTrueGold - owned.temperedTrueGold),
  };
  const tcTiers = new Set(steps.filter((step) => step.buildingId === "town-center").map((step) => step.to));
  const approximateTownCenter = TOWN_CENTER_APPROXIMATE.filter((row) => tcTiers.has(row.tier)).reduce((sum, row) => ({
    bread: sum.bread + row.bread,
    wood: sum.wood + row.wood,
    stone: sum.stone + row.stone,
    iron: sum.iron + row.iron,
    seconds: sum.seconds + row.seconds,
  }), { bread: 0, wood: 0, stone: 0, iron: 0, seconds: 0 });

  const refining = planTtgProduction({
    ...refinement,
    stopAtTarget: true,
    trueGold: owned.trueGold,
    temperedTrueGold: owned.temperedTrueGold,
    requiredTrueGold: totals.trueGold,
    requiredTempered: totals.temperedTrueGold,
  });
  return { steps, totals, owned, shortfall, approximateTownCenter, refining, warnings };
}

export function exportUpdatedConstructionCsv(plan) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["Order", "Building", "From", "To", "True Gold", "Tempered True Gold"]];
  plan.steps.forEach((step, index) => rows.push([index + 1, step.building, step.from, step.to, step.trueGold, step.temperedTrueGold]));
  rows.push(["TOTAL", "", "", "", plan.totals.trueGold, plan.totals.temperedTrueGold]);
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}
