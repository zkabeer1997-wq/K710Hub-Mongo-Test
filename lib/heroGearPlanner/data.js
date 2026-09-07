/**
 * Loader for the Hero Gear Planner's data-driven schema. All numeric game
 * values live in /data/hero-gear/*.json (currently placeholder rows - see
 * each file's `_comment`); this module only shapes and validates them for
 * the solver and UI. Nothing here should hardcode a game number.
 *
 * CommonJS on purpose (not .mjs): `require()` of a .json file works
 * identically under Node's native module loader, under `node --test`, and
 * under Next's webpack/SWC bundling for both server and client components,
 * with no import-assertion syntax to keep in sync across environments. ESM
 * callers (solver.mjs, .jsx components, .mjs tests) import named exports
 * from this file directly - Node and bundlers both support that interop
 * for a CJS module that assigns `module.exports` once, as this one does.
 */

const troopSlotsFile = require('../../data/hero-gear/troop-slots.json');
const enhancementLadderFile = require('../../data/hero-gear/enhancement-ladder.json');
const masteryLadderFile = require('../../data/hero-gear/mastery-ladder.json');
const redImbuementLadderFile = require('../../data/hero-gear/red-imbuement-ladder.json');
const buildProfilesFile = require('../../data/hero-gear/build-profiles.json');
const redGearStrategiesFile = require('../../data/hero-gear/red-gear-strategies.json');
const reforgeConfigFile = require('../../data/hero-gear/reforge-config.json');

/**
 * @typedef {'infantry'|'cavalry'|'archer'} TroopType
 * @typedef {'helm'|'gloves'|'chest'|'boots'} GearSlot
 * @typedef {'health'|'lethality'} StatType
 * @typedef {'enhancement'|'mastery'|'redImbuement'} ChainType
 *
 * @typedef {Object} TroopSlotConfig
 * @property {TroopType} troopType
 * @property {GearSlot} slot
 * @property {StatType} statType
 * @property {number} multiplier
 *
 * @typedef {Object} EnhancementStep
 * @property {number} level
 * @property {{xp: number}} cost
 * @property {number} cumulativeStatBonus - total % accrued through this level (not a delta)
 * @property {number} requiredTownCenterLevel
 * @property {{conservative: boolean, progressive: boolean}} milestoneFlags
 *
 * @typedef {Object} MasteryStep
 * @property {number} level
 * @property {{forgehammers: number, mythicGear: number}} cost
 * @property {number} cumulativeStatBonus
 * @property {number} requiredTownCenterLevel
 *
 * @typedef {Object} RedImbuementStep
 * @property {number} level
 * @property {{mithril: number}} cost
 * @property {number} cumulativeStatBonus
 *
 * @typedef {Object} BuildProfile
 * @property {string} label
 * @property {string} description
 * @property {Record<string, number>} weights - keys like "infantryHealth", "cavalryLethality"
 */

function chainKey(troopType, slot) {
  return `${troopType}:${slot}`;
}

/** @returns {TroopSlotConfig[]} */
function getTroopSlots() {
  return troopSlotsFile.rows;
}

/** @returns {TroopType[]} unique troop types present in troop-slots.json, in first-seen order */
function getTroopTypes() {
  const seen = new Set();
  const ordered = [];
  for (const row of troopSlotsFile.rows) {
    if (!seen.has(row.troopType)) {
      seen.add(row.troopType);
      ordered.push(row.troopType);
    }
  }
  return ordered;
}

/** @returns {GearSlot[]} unique slots present in troop-slots.json, in first-seen order */
function getGearSlots() {
  const seen = new Set();
  const ordered = [];
  for (const row of troopSlotsFile.rows) {
    if (!seen.has(row.slot)) {
      seen.add(row.slot);
      ordered.push(row.slot);
    }
  }
  return ordered;
}

/** @returns {TroopSlotConfig|undefined} */
function getSlotConfig(troopType, slot) {
  return troopSlotsFile.rows.find((row) => row.troopType === troopType && row.slot === slot);
}

/** @returns {EnhancementStep[]} empty array if this troop/slot has no chain in the data file yet */
function getEnhancementChain(troopType, slot) {
  return enhancementLadderFile.chains[chainKey(troopType, slot)] || [];
}

/** @returns {MasteryStep[]} empty array if this troop/slot has no chain in the data file yet */
function getMasteryChain(troopType, slot) {
  return masteryLadderFile.chains[chainKey(troopType, slot)] || [];
}

/** @returns {RedImbuementStep[]} empty array if this troop/slot has no chain in the data file yet */
function getRedImbuementChain(troopType, slot) {
  return redImbuementLadderFile.chains[chainKey(troopType, slot)] || [];
}

/** @returns {Record<string, BuildProfile>} keyed by profile id, e.g. "earlyGameGrowth" */
function getBuildProfiles() {
  return buildProfilesFile.profiles;
}

/** @returns {Record<'conservative'|'progressive', {label: string, description: string}>} */
function getRedGearStrategies() {
  return redGearStrategiesFile.strategies;
}

/** @returns {{recoveryRate: number}} */
function getReforgeConfig() {
  return reforgeConfigFile;
}

module.exports = {
  chainKey,
  getTroopSlots,
  getTroopTypes,
  getGearSlots,
  getSlotConfig,
  getEnhancementChain,
  getMasteryChain,
  getRedImbuementChain,
  getBuildProfiles,
  getRedGearStrategies,
  getReforgeConfig,
};
