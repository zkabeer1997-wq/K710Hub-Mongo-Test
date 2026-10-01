import { DATASET_MANIFEST } from "./datasetManifest.mjs";

export const TOOL_CATEGORIES = Object.freeze([
  { id: "gear", label: "Gear" },
  { id: "charms", label: "Charms" },
  { id: "pets-masters", label: "Pets & Masters" },
  { id: "construction-research", label: "Construction & Research" },
  { id: "event-shops", label: "Event Shops" },
  { id: "planning", label: "Planning" },
]);

// Old ?category= values (bookmarks, in-app links) -> new category id.
// null means "show everything" (the old UPDATED TOOLS bucket held most tools).
const LEGACY_CATEGORY_VALUES = Object.freeze({
  "updated tools": null,
  "updated+tools": null,
  "account progression": "planning",
  charms: "charms",
  "special event shops": "event-shops",
  "special+event+shops": "event-shops",
  masters: "pets-masters",
  pets: "pets-masters",
  "research costs": "construction-research",
  research: "construction-research",
  "construction costs": "construction-research",
  "building costs": "construction-research",
  construction: "construction-research",
  gear: "gear",
});

/** Resolve a ?category= value (new id, label, or legacy value) to a category id or null. */
export function resolveToolCategory(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  const direct = TOOL_CATEGORIES.find((c) => c.id === key || c.label.toLowerCase() === key);
  if (direct) return direct.id;
  return Object.hasOwn(LEGACY_CATEGORY_VALUES, key) ? LEGACY_CATEGORY_VALUES[key] : null;
}

// Datasets backing each tool; freshness is the newest lastVerified among them.
const TOOL_DATASETS = Object.freeze({
  "hero-gear": ["hero-gear-progression"],
  "governor-gear": ["governor-gear-progression"],
  charms: ["charm-stats"],
  masters: ["master-progression"],
  pets: ["pet-progression"],
  construction: ["construction-costs", "ttg-refinement"],
  research: ["academy-research", "war-academy-research", "advanced-research"],
  "account-progression": ["account-progression-scoring"],
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** { iso, label: "Sep 2026" } from the dataset manifest, or null when no verified date exists. */
export function toolFreshness(slug, manifest = DATASET_MANIFEST) {
  const dates = (TOOL_DATASETS[slug] || []).map((id) => manifest[id]?.lastVerified).filter(Boolean).sort();
  const iso = dates[dates.length - 1];
  const match = typeof iso === "string" ? /^(\d{4})-(\d{2})-\d{2}$/.exec(iso) : null;
  if (!match) return null;
  return { iso, label: `${MONTHS[Number(match[2]) - 1]} ${match[1]}` };
}
