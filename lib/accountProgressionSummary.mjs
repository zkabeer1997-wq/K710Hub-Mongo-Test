import { CHARM_COSTS } from "./charmToolData.mjs";
import { calculateCosts } from "./costPlanner.mjs";
import { calculateMasterLevelMaterials } from "./mastersLevelCalculator.mjs";
import {
  calculateGovernorGearPlan,
  calculateHeroGearPlan,
  calculatePetProgression,
  rankCharmUpgrades,
} from "./progressionPhase2.mjs";
import { calculateUpdatedConstruction } from "./updatedConstruction.mjs";

export const ACCOUNT_SUMMARY_SYSTEMS = Object.freeze([
  { id: "heroGear", label: "Hero Gear", route: "/tools/updated-hero-gear", keys: ["updated-hero-gear"], legacy: ["hero-gear"] },
  { id: "governorGear", label: "Governor Gear", route: "/tools/updated-governor-gear", keys: ["updated-governor-gear"], legacy: ["governor-gear"] },
  { id: "charms", label: "Charms", route: "/tools/updated-charms", keys: ["updated-charms"], legacy: ["governor-charm-stats"] },
  { id: "masters", label: "Masters", route: "/tools/updated-masters", keys: ["updated-masters"], legacy: ["masters", "masters-pack-optimizer"] },
  { id: "pets", label: "Pets", route: "/tools/updated-pets", keys: ["updated-pets"], legacy: ["pet-progression", "pet-pack-optimizer"] },
  { id: "construction", label: "Construction & TTG", route: "/tools/updated-construction", keys: ["updated-construction"], legacy: ["costs-construction", "ttg-production"] },
  { id: "research", label: "Research", route: "/tools/updated-research", keys: ["costs-academy", "costs-war-academy", "costs-advanced-research"], legacy: [] },
]);

export const ACCOUNT_SUMMARY_SOURCE_KEYS = Object.freeze([
  ...new Set(ACCOUNT_SUMMARY_SYSTEMS.flatMap((system) => [...system.keys, ...system.legacy])),
]);

// Only migrate states whose old and Updated Tool screens share the same input
// contract. Retired single-entity planners are intentionally excluded because
// guessing at their shape could silently change a member's plan.
export const ACCOUNT_LEGACY_MIGRATIONS = Object.freeze([
  { from: "hero-gear", to: "updated-hero-gear", schemaVersion: 1 },
  { from: "governor-gear", to: "updated-governor-gear", schemaVersion: 2 },
  { from: "governor-charm-stats", to: "updated-charms", schemaVersion: 1 },
  { from: "masters-pack-optimizer", to: "updated-masters", schemaVersion: 4 },
  { from: "pet-pack-optimizer", to: "updated-pets", schemaVersion: 3 },
]);

export function buildLegacyMigrationCandidates(sources = {}) {
  return ACCOUNT_LEGACY_MIGRATIONS.flatMap(({ from, to, schemaVersion }) => {
    if (sources[to]?.state || !sources[from]?.state) return [];
    const inputs = unwrap(sources[from]);
    if (!inputs) return [];
    return [{
      from,
      to,
      state: { envelopeVersion: 1, toolKey: to, schemaVersion, inputs },
    }];
  });
}

const number = (value) => Math.max(0, Number(value) || 0);
const unwrap = (value) => value?.state?.inputs || value?.state || value?.inputs || value || null;
const positive = (values = {}) => Object.values(values).some((value) => number(value) > 0);
const resourcesText = (resources = {}) => Object.entries(resources).filter(([, value]) => number(value) > 0).map(([key, value]) => `${number(value).toLocaleString()} ${key}`).join(" · ") || "No materials required";

function sourceFor(system, sources) {
  for (const key of system.keys) {
    if (sources[key]?.state) return { key, value: unwrap(sources[key]), updatedAt: sources[key].updatedAt || "", legacy: false };
  }
  for (const key of system.legacy) {
    if (sources[key]?.state) return { key, value: unwrap(sources[key]), updatedAt: sources[key].updatedAt || "", legacy: true };
  }
  return null;
}

function baseSummary(system, source) {
  return {
    id: system.id,
    label: system.label,
    route: system.route,
    sourceKey: source?.key || null,
    updatedAt: source?.updatedAt || "",
    legacy: Boolean(source?.legacy),
    status: source ? (source.legacy ? "legacy" : "connected") : "missing",
    targetLabel: source ? "Saved plan connected" : "No current plan saved",
    completionPercent: null,
    nextAction: null,
    affordable: false,
    requirements: {},
    inventory: {},
    shortfall: {},
    exactKvkPoints: null,
    eligibleKvkDays: [],
    scoringStatus: "unavailable",
  };
}

function heroSummary(system, source) {
  const summary = baseSummary(system, source);
  if (!source?.value?.rows?.length) return summary;
  const plan = calculateHeroGearPlan(source.value.rows, source.value);
  const action = plan.nextAction || plan.recommendation || plan.nearMisses?.[0] || null;
  const requirements = action?.costs || {
    xp: action?.xp || 0,
    forgehammers: action?.forgehammers || 0,
    mythicPieces: action?.mythicPieces ?? action?.mythic ?? 0,
    mithril: action?.mithril || 0,
  };
  const inventory = plan.remaining || { xp: source.value.xp, forgehammers: source.value.forgehammers, mythicPieces: source.value.mythicPieces, mithril: source.value.mithril };
  const shortfall = Object.fromEntries(Object.entries(requirements).map(([key, cost]) => [key, Math.max(0, number(cost) - number(inventory[key]))]));
  const target = action?.actionType === "mastery" ? `Mastery ${action.mastery}` : `+${action?.level ?? action?.targetLevel}`;
  return { ...summary, targetLabel: action ? `${action.label} → ${target}` : "No upgrade selected", nextAction: action, affordable: Boolean(plan.nextAction || plan.recommendation) && !positive(shortfall), requirements, inventory, shortfall, exactKvkPoints: action ? number(action.eventPoints) : null, eligibleKvkDays: [4, 5], scoringStatus: action ? "verified" : "unavailable" };
}

function governorSummary(system, source) {
  const summary = baseSummary(system, source);
  if (!source?.value?.rows?.length) return summary;
  const plan = calculateGovernorGearPlan(source.value.rows, source.value);
  const action = plan.steps?.[0] || plan.next || plan.nearMisses?.[0] || null;
  const requirements = action ? { satin: action.satin, threads: action.threads, visions: action.visions } : {};
  const inventory = plan.remaining || { satin: source.value.satin, threads: source.value.threads, visions: source.value.visions };
  const shortfall = Object.fromEntries(Object.entries(requirements).map(([key, cost]) => [key, Math.max(0, number(cost) - number(inventory[key]))]));
  return { ...summary, targetLabel: action ? `${action.piece} → ${action.tier}` : "No upgrade selected", nextAction: action, affordable: Boolean(plan.steps?.[0]) && !positive(shortfall), requirements, inventory, shortfall, exactKvkPoints: action ? number(action.eventPoints) : null, eligibleKvkDays: [5], scoringStatus: action?.eventPointsProvenance || "unavailable" };
}

function charmsSummary(system, source) {
  const summary = baseSummary(system, source);
  if (!source?.value?.charms?.length) return summary;
  const value = source.value;
  const plan = rankCharmUpgrades(value.charms, CHARM_COSTS, { guides: value.guides, designs: value.designs }, { troops: value.troopWeights || {}, stats: value.statWeights || {}, amplification: value.amplification, mode: value.optimizationGoal }, { minimumBalance: value.minimumBalance });
  const action = plan.upgrades?.[0] || plan.next || plan.nearMisses?.[0] || null;
  const requirements = action ? { guides: action.guides, designs: action.designs } : {};
  const inventory = plan.remaining || { guides: value.guides, designs: value.designs };
  const shortfall = Object.fromEntries(Object.entries(requirements).map(([key, cost]) => [key, Math.max(0, number(cost) - number(inventory[key]))]));
  return { ...summary, targetLabel: action ? `${action.type} charm ${action.number} → level ${action.level}` : "Targets complete", nextAction: action, affordable: Boolean(plan.upgrades?.[0]) && !positive(shortfall), requirements, inventory, shortfall, exactKvkPoints: action ? number(action.eventPoints) : null, eligibleKvkDays: [1, 3, 4], scoringStatus: action?.eventPointsProvenance || "unavailable" };
}

function mastersSummary(system, source) {
  const summary = baseSummary(system, source);
  const calculators = source?.value?.calculators;
  if (!Array.isArray(calculators) || !calculators.length) return summary;
  const rows = calculators.map(calculateMasterLevelMaterials);
  const requirements = rows.reduce((total, row) => ({ affinity: total.affinity + row.affinity, emblems: total.emblems + row.emblems, manuscripts: total.manuscripts + row.manuscripts }), { affinity: 0, emblems: 0, manuscripts: 0 });
  const inventory = source.value.have || {};
  const shortfall = Object.fromEntries(Object.entries(requirements).map(([key, cost]) => [key, Math.max(0, number(cost) - number(inventory[key]))]));
  const active = rows.filter((row) => row.currentLevel < row.targetLevel || row.manuscripts > 0);
  return { ...summary, targetLabel: active.length ? `${active.length} Master target${active.length === 1 ? "" : "s"}` : "Targets complete", nextAction: active[0] || null, affordable: !positive(shortfall), requirements, inventory, shortfall, exactKvkPoints: number(requirements.emblems) * 6000 + number(requirements.manuscripts) * 60, eligibleKvkDays: [2, 3], scoringStatus: "community-reported" };
}

function petsSummary(system, source) {
  const summary = baseSummary(system, source);
  const pets = source?.value?.pets;
  if (!Array.isArray(pets) || !pets.length) return summary;
  const rows = pets.map(calculatePetProgression);
  const requirements = rows.reduce((total, row) => ({ food: total.food + row.totals.food, manual: total.manual + row.totals.manuals, potion: total.potion + row.totals.potions, medal: total.medal + row.totals.medallions }), { food: 0, manual: 0, potion: 0, medal: 0 });
  const inventory = source.value.have || {};
  const shortfall = Object.fromEntries(Object.entries(requirements).map(([key, cost]) => [key, Math.max(0, number(cost) - number(inventory[key]))]));
  const active = pets.filter((pet) => number(pet.targetLevel) > number(pet.currentLevel));
  return { ...summary, targetLabel: active.length ? `${active.length} pet target${active.length === 1 ? "" : "s"}` : "Targets complete", nextAction: active[0] || null, affordable: !positive(shortfall), requirements, inventory, shortfall, exactKvkPoints: null, eligibleKvkDays: [3, 5], scoringStatus: "unavailable" };
}

function constructionSummary(system, source) {
  const summary = baseSummary(system, source);
  if (!source?.value?.selections) return summary;
  const value = source.value;
  const plan = calculateUpdatedConstruction(value.selections, value.inventory, value.refinement, value.settings);
  const action = plan.steps?.[0] || null;
  const requirements = plan.totals || {};
  return { ...summary, targetLabel: action ? `${plan.steps.length} building step${plan.steps.length === 1 ? "" : "s"} planned` : "Targets complete", nextAction: action, affordable: !positive(plan.shortfall), requirements, inventory: plan.owned, shortfall: plan.shortfall, exactKvkPoints: null, eligibleKvkDays: [1, 2, 5], scoringStatus: "unavailable" };
}

function researchSummary(system, sources, datasets) {
  const present = system.keys.map((key) => ({ key, record: sources[key] })).filter((item) => item.record?.state);
  const summary = baseSummary(system, present[0] ? { key: present[0].key, value: unwrap(present[0].record), updatedAt: present[0].record.updatedAt } : null);
  const plans = present.flatMap(({ key, record }) => {
    const kind = key.replace("costs-", "");
    const dataset = datasets[kind === "war-academy" ? "warAcademy" : kind === "advanced-research" ? "advancedResearch" : "academy"];
    const value = unwrap(record);
    if (!dataset || !value?.selections?.length) return [];
    try { return [{ kind, plan: calculateCosts(dataset, { ...value, kind: "research" }) }]; } catch { return []; }
  });
  const requirements = plans.reduce((total, item) => { for (const [key, value] of Object.entries(item.plan.totals || {})) total[key] = number(total[key]) + number(value); return total; }, {});
  const shortfall = plans.reduce((total, item) => { for (const [key, value] of Object.entries(item.plan.shortfall || {})) total[key] = number(total[key]) + number(value); return total; }, {});
  const steps = plans.reduce((sum, item) => sum + item.plan.steps.length, 0);
  return { ...summary, sourceKey: present.map((item) => item.key).join(","), updatedAt: present.map((item) => item.record.updatedAt || "").sort().at(-1) || "", targetLabel: steps ? `${steps} exact research level${steps === 1 ? "" : "s"}` : present.length ? "No calculated target" : summary.targetLabel, nextAction: plans[0]?.plan.steps?.[0] || null, affordable: plans.length > 0 && !positive(shortfall), requirements, shortfall, exactKvkPoints: null, eligibleKvkDays: [2], scoringStatus: "unavailable" };
}

export function buildAccountSummaries({ sources = {}, datasets = {} } = {}) {
  return ACCOUNT_SUMMARY_SYSTEMS.map((system) => {
    if (system.id === "research") return researchSummary(system, sources, datasets);
    const source = sourceFor(system, sources);
    if (system.id === "heroGear") return heroSummary(system, source);
    if (system.id === "governorGear") return governorSummary(system, source);
    if (system.id === "charms") return charmsSummary(system, source);
    if (system.id === "masters") return mastersSummary(system, source);
    if (system.id === "pets") return petsSummary(system, source);
    if (system.id === "construction") return constructionSummary(system, source);
    return baseSummary(system, source);
  });
}

export function buildProgressionOverview(summaries, { objective = "summary", dailyTarget = 200000 } = {}) {
  const connected = summaries.filter((item) => item.status !== "missing");
  const legacy = connected.filter((item) => item.legacy);
  const actionable = connected.filter((item) => item.nextAction && !item.legacy);
  const exactActions = actionable.filter((item) => item.exactKvkPoints != null && item.scoringStatus === "verified");
  const preferenceOrder = { governorGear: 7, heroGear: 6, charms: 5, masters: 4, pets: 3, research: 2, construction: 1 };
  const actions = [...actionable].sort((a, b) => {
    if (objective === "kvk") return (b.exactKvkPoints ?? -1) - (a.exactKvkPoints ?? -1) || Number(b.affordable) - Number(a.affordable);
    return Number(b.affordable) - Number(a.affordable) || (preferenceOrder[b.id] || 0) - (preferenceOrder[a.id] || 0);
  });
  const days = [1, 2, 3, 4, 5].map((day) => {
    const items = actionable.filter((item) => item.eligibleKvkDays.includes(day) && item.eligibleKvkDays[0] === day);
    const exactPoints = items.filter((item) => item.scoringStatus === "verified").reduce((sum, item) => sum + number(item.exactKvkPoints), 0);
    return { day, items, exactPoints, target: number(dailyTarget), covered: exactPoints >= number(dailyTarget) };
  });
  return { connected, legacy, actionable, actions: actions.slice(0, 3), exactKvkPoints: exactActions.reduce((sum, item) => sum + number(item.exactKvkPoints), 0), days, bottlenecks: actions.flatMap((item) => Object.entries(item.shortfall || {}).filter(([, value]) => number(value) > 0).map(([resource, amount]) => ({ system: item.label, resource, amount }))).slice(0, 3) };
}

export function accountSummaryCsv(overview) {
  const rows = [["Priority", "System", "Next action", "Affordable", "Requirements", "Shortfall", "Exact KvK points"]];
  overview.actions.forEach((item, index) => rows.push([index + 1, item.label, item.targetLabel, item.affordable ? "Yes" : "No", resourcesText(item.requirements), resourcesText(item.shortfall), item.scoringStatus === "verified" ? item.exactKvkPoints : "Unavailable"]));
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/^[=+@-]/, "'").replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

export { resourcesText };
