export const SUPPORTED_TOOL_KEYS = Object.freeze([
  "charm-pack-optimizer",
  "wavebound-charms",
  "pet-pack-optimizer",
  "flamedragon-shop",
  "adventure-stall",
  "costs-construction",
  "costs-academy",
  "costs-war-academy",
  "costs-advanced-research",
  "ttg-production",
  "pet-progression",
  "governor-charm-stats",
  "hero-gear",
  "governor-gear",
  "masters",
  "masters-pack-optimizer",
  "account-progression",
  "updated-hero-gear",
  "updated-governor-gear",
  "updated-charms",
  "updated-masters",
  "updated-pets",
  "updated-construction",
  "updated-research",
]);

export function isSupportedToolKey(value) {
  return typeof value === "string" && SUPPORTED_TOOL_KEYS.includes(resolveToolStorageKey(value));
}

/**
 * Saved plans (member_tool_state) and admin overrides (tool_settings) are keyed
 * by the *storage key*. When a tool's public name/slug changes, the documents
 * must keep working, so the new public key is aliased to the storage key that
 * already holds the data. Aliases are accepted everywhere a tool key is read or
 * written; the stored document keeps its original tool_key.
 *
 * The seven planners that used to carry "Updated" in their slug (hero-gear,
 * governor-gear, charms, masters, pets, construction, research) deliberately
 * keep their stored "updated-*" keys: the plain names collide with the older
 * pre-planner keys ("hero-gear", "masters", ...), which hold different data.
 */
export const TOOL_KEY_ALIASES = Object.freeze({
  "charm-sailing-optimizer": "wavebound-charms",
  "dragons-caravan-optimizer": "flamedragon-shop",
});

/** Old public slug -> new public slug (used for permanent redirects). */
export const TOOL_SLUG_RENAMES = Object.freeze({
  "updated-hero-gear": "hero-gear",
  "updated-governor-gear": "governor-gear",
  "updated-charms": "charms",
  "updated-masters": "masters",
  "updated-pets": "pets",
  "updated-construction": "construction",
  "updated-research": "research",
  "wavebound-charms": "charm-sailing-optimizer",
  "flamedragon-shop": "dragons-caravan-optimizer",
});

/** Resolve any public/legacy key to the key its documents are stored under. */
export function resolveToolStorageKey(key) {
  if (typeof key !== "string") return key;
  return Object.hasOwn(TOOL_KEY_ALIASES, key) ? TOOL_KEY_ALIASES[key] : key;
}

/** Every key (storage + alias) that should be treated as the same tool. */
export function toolKeyVariants(key) {
  const storage = resolveToolStorageKey(key);
  return [storage, ...Object.entries(TOOL_KEY_ALIASES).filter(([, v]) => v === storage).map(([k]) => k)];
}

/** Public tool slug -> storage keys that hold that tool's saved plan. */
export const TOOL_SAVED_PLAN_KEYS = Object.freeze({
  "hero-gear": ["updated-hero-gear"],
  "governor-gear": ["updated-governor-gear"],
  charms: ["updated-charms"],
  masters: ["updated-masters"],
  pets: ["updated-pets"],
  construction: ["updated-construction"],
  research: ["costs-academy", "costs-war-academy", "costs-advanced-research"],
  "governor-gear-sailing-tool": ["governor-gear-sailing-tool"],
  "account-progression": ["account-progression"],
  "charm-sailing-optimizer": ["wavebound-charms"],
  "dragons-caravan-optimizer": ["flamedragon-shop"],
  "adventure-stall": ["adventure-stall"],
});

export const ALL_SAVED_PLAN_STORAGE_KEYS = Object.freeze([...new Set(Object.values(TOOL_SAVED_PLAN_KEYS).flat())]);

/**
 * Turn raw member_tool_state rows ({tool_key, updated_at}) into
 * { [toolSlug]: updatedAt|null } for the tools that have a saved plan.
 */
export function savedPlansBySlug(records) {
  const byKey = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record && typeof record.tool_key === "string") byKey.set(record.tool_key, record.updated_at ?? null);
  }
  const result = {};
  for (const [slug, keys] of Object.entries(TOOL_SAVED_PLAN_KEYS)) {
    const hits = keys.filter((key) => byKey.has(key)).map((key) => byKey.get(key));
    if (!hits.length) continue;
    const dates = hits.filter(Boolean).map(String).sort();
    result[slug] = dates.length ? dates[dates.length - 1] : null;
  }
  return result;
}
