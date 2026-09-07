export const DATASET_STATUS = Object.freeze({
  VERIFIED: "verified",
  COMMUNITY: "community-reported",
  EXPERIMENTAL: "experimental",
  INCOMPLETE: "incomplete",
});

export const DATASET_MANIFEST = Object.freeze({
  "kvk-prep-points": {
    name: "KvK Preparation Day 1–5 point rules",
    source: "https://kingshotmastery.com/guides/kingshot-kvk-prep-guide",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.COMMUNITY,
    limitations:
      "These event values are community-reported and can change by game version. Confirm the live event screen before spending. Exact totals exclude activities not represented in connected planner inputs, including intel, shards, roulette, gathering, troop training, widgets, and manually entered speedups.",
    assumptions: [
      "Actions are assigned to the guide's preferred scoring day when several days award the same listed points.",
      "The default daily chest target is 200,000 points and remains editable.",
    ],
    experimental: ["Cross-system KvK day assignment"],
    version: "2026-08-24",
  },
  "account-progression-scoring": {
    name: "Unified account progression scoring",
    source: "K710 member priorities and verified source-planner outputs",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.EXPERIMENTAL,
    limitations:
      "Cross-system ranks are subjective planning guidance, not a Kingshot combat formula. Upgrade costs and benefits retain the provenance of their source planner.",
    assumptions: [
      "Planning score = member system weight × selected-goal fit × feasibility × deadline fit.",
      "System weights and goal profiles are editable preferences, not game values.",
    ],
    experimental: ["Cross-system priority score", "Sensitivity range"],
    version: "1.0.0",
  },
  "governor-charm-costs": {
    name: "Governor Charm upgrade costs",
    source: "Existing K710 Hub dataset",
    lastVerified: null,
    status: DATASET_STATUS.INCOMPLETE,
    limitations:
      "Costs are retained from the existing implementation; original evidence and stat gains still require verification.",
    assumptions: [],
    experimental: [],
    version: "1.0.0",
  },
  "wavebound-treasures": {
    name: "Wavebound Tidal Treasure rewards",
    source: "Existing K710 Hub configuration",
    lastVerified: null,
    status: DATASET_STATUS.COMMUNITY,
    limitations:
      "Chest contents and the 75%/25% outcome are community-reported and should be checked against the current event.",
    assumptions: ["Premium merge outcomes are independent binomial trials."],
    experimental: [],
    version: "1.0.0",
  },
  "pet-pack-contents": {
    name: "Pet pack contents",
    source: "Existing K710 Hub configuration",
    lastVerified: null,
    status: DATASET_STATUS.INCOMPLETE,
    limitations:
      "Existing values are retained, but their original evidence and verification date still need to be recorded.",
    assumptions: ["Each pack tier can be purchased once per week."],
    experimental: [],
    version: "1.0.0",
  },
  "dragons-caravan": {
    name: "Dragon's Caravan shop and packs",
    source: "Existing K710 Hub configuration",
    lastVerified: null,
    status: DATASET_STATUS.INCOMPLETE,
    limitations:
      "Shop quantities are configurable. Value tiers are subjective guidance, not universal game value.",
    assumptions: ["Value comparisons use editable community priorities."],
    experimental: [],
    version: "1.0.0",
  },
  "adventure-stall": {
    name: "Adventure Stall shop and packs",
    source: "Existing K710 Hub configuration",
    lastVerified: null,
    status: DATASET_STATUS.INCOMPLETE,
    limitations:
      "Pack and shop quantities need dated source evidence for the current event version.",
    assumptions: ["Daily pack limits reset once per event day."],
    experimental: [],
    version: "1.0.0",
  },
  "academy-research": {
    name: "Academy Research costs",
    source: "https://kingshotoptimizer.com/data/academy-research/",
    lastVerified: "2026-09-03",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Use only for game versions matching the retrieved dataset.",
    assumptions: [],
    experimental: [],
    version: "2026-09-03",
  },
  "war-academy-research": {
    name: "War Academy Research costs",
    source: "Existing imported reference dataset",
    lastVerified: "2026-09-03",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Kingdom must have unlocked the selected tier.",
    assumptions: [],
    experimental: [],
    version: "2026-09-03",
  },
  "advanced-research": {
    name: "Advanced Research costs",
    source: "Existing imported reference dataset",
    lastVerified: "2026-09-03",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Kingdom must have unlocked the selected tier.",
    assumptions: [],
    experimental: [],
    version: "2026-09-03",
  },
  "construction-costs": {
    name: "Construction costs",
    source: "https://kingshotoptimizer.com/calculators/buildings",
    lastVerified: "2026-09-03",
    status: DATASET_STATUS.VERIFIED,
    limitations:
      "Some prerequisite relationships remain incomplete and are disclosed in calculator warnings.",
    assumptions: [],
    experimental: [],
    version: "2026-09-03",
  },
  "ttg-refinement": {
    name: "Tempered True Gold refinement outcomes",
    source: "https://kingshot.net/truegold-planner",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.VERIFIED,
    limitations:
      "Production is probabilistic; expected output is not guaranteed.",
    assumptions: [
      "The first refinement each day costs half and weekly attempts reset Monday.",
    ],
    experimental: [],
    version: "2026-09-06",
  },
  "pet-progression": {
    name: "Pet level and advancement costs",
    source: "https://www.kingshotguide.org/data-center/kingshot-pets-database",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Pet availability depends on kingdom age.",
    assumptions: [],
    experimental: [],
    version: "2026-09-06",
  },
  "charm-stats": {
    name: "Governor Charm stat gains",
    source: "https://www.kingshotguide.org/data-center/governor-charm-kingshot",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Priority weights are subjective.",
    assumptions: ["Priority weights are subjective and user-editable."],
    experimental: [],
    version: "2026-09-06",
  },
  "hero-gear-progression": {
    name: "Hero Gear costs and stat gains",
    source: "https://kingshotoptimizer.com/hero-gear/references/xp-costs",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Recommendations use milestone costs and editable priorities.",
    assumptions: ["Priority weights are subjective and user-editable."],
    experimental: [],
    version: "2026-09-06",
  },
  "governor-gear-progression": {
    name: "Governor Gear costs, stats, and set bonuses",
    source: "https://www.kingshotguide.org/data-center/governor-gear-kingshot",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.VERIFIED,
    limitations: "Set bonuses require matching tiers.",
    assumptions: ["Priority weights are subjective and user-editable."],
    experimental: [],
    version: "2026-09-06",
  },
  "master-progression": {
    name: "Master progression costs and benefits",
    source:
      "https://www.kingshotguide.org/data-center/kingshot-masters-database",
    lastVerified: "2026-09-06",
    status: DATASET_STATUS.VERIFIED,
    limitations:
      "Relationship milestone values are shared; skill planning is tracked independently.",
    assumptions: [],
    experimental: [],
    version: "2026-09-06",
  },
});

export function getDataset(id) {
  const dataset = DATASET_MANIFEST[id];
  if (!dataset) throw new Error(`Unknown dataset: ${id}`);
  return dataset;
}
