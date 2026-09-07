/**
 * Static reference data for the Hero Gear Planner.
 *
 * Kept separate from the compute layer (lib/heroGearPlannerCompute.mjs) so the
 * shape of "what gear exists" can be reused by future read-only surfaces
 * (Reference Data tab, Sensitivity Analysis) without pulling in the
 * optimizer itself.
 */

export const TROOP_TYPES = [
  { id: 'infantry', label: 'Infantry' },
  { id: 'cavalry', label: 'Cavalry' },
  { id: 'archer', label: 'Archer' },
];

export const STAT_TYPES = {
  lethality: { id: 'lethality', label: 'Lethality' },
  health: { id: 'health', label: 'Health' },
};

// Slot order is fixed across every troop type - Helm/Gloves/Chest/Boots -
// only the stat focus and multiplier differ per troop.
export const GEAR_SLOTS = [
  { id: 'helm', label: 'Helm' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'chest', label: 'Chest' },
  { id: 'boots', label: 'Boots' },
];

// Multiplier + stat focus per troop/slot. These mirror Kingshot's live gear
// table (each slot leans either Lethality or Health, never both) and are
// the numbers the optimizer weighs contributions against.
export const SLOT_CONFIG = {
  infantry: {
    helm: { stat: 'health', multiplier: 1.2 },
    gloves: { stat: 'lethality', multiplier: 0.6 },
    chest: { stat: 'health', multiplier: 1.1 },
    boots: { stat: 'lethality', multiplier: 0.4 },
  },
  cavalry: {
    helm: { stat: 'lethality', multiplier: 1.2 },
    gloves: { stat: 'health', multiplier: 0.6 },
    chest: { stat: 'lethality', multiplier: 1.1 },
    boots: { stat: 'health', multiplier: 0.4 },
  },
  archer: {
    helm: { stat: 'lethality', multiplier: 1.1 },
    gloves: { stat: 'health', multiplier: 0.6 },
    chest: { stat: 'lethality', multiplier: 1.2 },
    boots: { stat: 'health', multiplier: 0.4 },
  },
};

// Ordered low -> high. "Red" is the current top tier.
export const GEAR_TIERS = [
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'purple', label: 'Purple' },
  { id: 'gold', label: 'Gold' },
  { id: 'red', label: 'Red' },
];

export const ENHANCEMENT_LEVEL_MAX = 20;
export const MASTERY_LEVEL_MAX = 20;

// Mastery levels 11-20 spend Mythic Gear/Gold instead of Forgehammers - the
// resource summary and near-miss analysis both need this breakpoint.
export const MASTERY_MYTHIC_BREAKPOINT = 11;

/**
 * Combined Enhancement + Mastery contribution to "Current Stat %". This is a
 * placeholder curve (each level worth a flat amount, Mastery weighted higher
 * per-level than Enhancement) - close enough for realistic-looking UI, not a
 * reverse-engineered production formula.
 */
export function computeCurrentStatPercent({ enhancementLevel = 0, masteryLevel = 0 }) {
  const enhancement = Math.min(Math.max(enhancementLevel, 0), ENHANCEMENT_LEVEL_MAX) * 1.35;
  const mastery = Math.min(Math.max(masteryLevel, 0), MASTERY_LEVEL_MAX) * 2.1;
  return Math.round((enhancement + mastery) * 100) / 100;
}

export const BUILD_PROFILES = [
  {
    id: 'early-growth',
    label: 'Early Game Growth',
    description: 'Favors Health across the board so new accounts can absorb hits while troop count is still low.',
    weights: {
      infantry: { health: 0.24, lethality: 0.09 },
      cavalry: { health: 0.2, lethality: 0.11 },
      archer: { health: 0.2, lethality: 0.16 },
    },
  },
  {
    id: 'early-combat',
    label: 'Early Game Combat',
    description: 'Leans into Lethality for players pushing rally damage or event leaderboards early.',
    weights: {
      infantry: { health: 0.14, lethality: 0.18 },
      cavalry: { health: 0.12, lethality: 0.24 },
      archer: { health: 0.1, lethality: 0.22 },
    },
  },
  {
    id: 'future-proofed',
    label: 'Future-Proofed (Late Game)',
    description: 'Balances all three troop types evenly so nothing is under-invested once KvK rotations demand a full army.',
    weights: {
      infantry: { health: 0.17, lethality: 0.17 },
      cavalry: { health: 0.17, lethality: 0.16 },
      archer: { health: 0.16, lethality: 0.17 },
    },
  },
  {
    id: 'unweighted',
    label: 'Unweighted',
    description: 'Treats every stat point the same regardless of troop type or Health/Lethality split. Useful as a neutral baseline.',
    weights: {
      infantry: { health: 1 / 6, lethality: 1 / 6 },
      cavalry: { health: 1 / 6, lethality: 1 / 6 },
      archer: { health: 1 / 6, lethality: 1 / 6 },
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Set your own weight per troop type and stat. Weights are relative to each other, not a fixed percentage.',
    weights: {
      infantry: { health: 1 / 6, lethality: 1 / 6 },
      cavalry: { health: 1 / 6, lethality: 1 / 6 },
      archer: { health: 1 / 6, lethality: 1 / 6 },
    },
  },
];

export const RED_GEAR_STRATEGIES = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'Only ascend to Red gear at expedition milestones (120 / 160 / 200). Slower, but never spends Mithril outside a guaranteed unlock window.',
  },
  {
    id: 'progressive',
    label: 'Progressive',
    description: 'Push incremental Red gear upgrades as soon as resources allow, ahead of milestones. Faster stat gains, higher Mithril burn rate.',
  },
];

export const TOWN_CENTER_LEVEL_OPTIONS = Array.from({ length: 12 }, (_, i) => 30 - i).map((level) => ({
  id: String(level),
  label: `TC ${level}`,
}));

export const RESOURCE_FIELDS = [
  {
    id: 'forgehammers',
    label: 'Forgehammers',
    tooltip: 'Spent on Mastery levels 1-10. Refunded partially on gear tier upgrades.',
  },
  {
    id: 'mythicGear',
    label: 'Mythic Gear / Gold',
    tooltip: 'Spent on Mastery levels 11-20, ascension, and imbuements.',
  },
  {
    id: 'mithril',
    label: 'Mithril',
    tooltip: 'Spent exclusively on Red Gear imbuements.',
  },
];

export function createEmptySlotState() {
  return { tier: 'green', enhancementLevel: 0, masteryLevel: 0 };
}

export function createEmptyTroopState() {
  return {
    included: true,
    slots: Object.fromEntries(GEAR_SLOTS.map((slot) => [slot.id, createEmptySlotState()])),
  };
}

export function createDefaultGearState() {
  return Object.fromEntries(TROOP_TYPES.map((troop) => [troop.id, createEmptyTroopState()]));
}
