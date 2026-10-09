// Pure helpers that turn a member's saved Power Profile (governor_gear and
// charms strings) into the inputs the Tools & Calculators start from.
import { GOVERNOR_GEAR_LEVELS } from './phase2Data.mjs';
import { parseCharmSelections, parseGovernorGearSelections } from './powerProfiles.mjs';

// Planner row order (Cap, Watch, Coat, Pants, Belt, Weapon) -> profile slot keys.
// Same pairing as GOVERNOR_GEAR_OCR_SLOTS: hat=cavalry_1, pendant=cavalry_2,
// shirt=infantry_1, pants=infantry_2, ring=archer_1, baton=archer_2.
export const PLANNER_GEAR_SLOT_KEYS = ['cavalry_1', 'cavalry_2', 'infantry_1', 'infantry_2', 'archer_1', 'archer_2'];

// Green and Blue with stars: the planner names these steps with roman numerals ("Blue II"), but which star count
// each numeral means is not stated in any data file, so they are NOT mapped (the row keeps what it had).

/** Profile gear option ("Gold T3 ★★", "Red T0", "Blue 2 stars") -> planner tier name, or "" when unknown. */
export function profileGearToPlannerTier(option) {
  const match = String(option || '').trim().match(/^(Green|Blue|Purple|Gold|Red)(?:\s+T(\d+))?(?:\s+(★{1,3}|[1-3]\s*stars?))?$/i);
  if (!match) return '';
  const color = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  const tier = match[2] ? Number(match[2]) : 0;
  const starText = match[3] || '';
  const stars = starText.includes('★') ? starText.length : Number.parseInt(starText, 10) || 0;
  let name;
  if (color === 'Green' || color === 'Blue') {
    if (tier > 0 || stars > 0) return '';
    name = color;
  } else {
    name = tier > 0 ? `${color} T${tier}` : color;
    if (stars > 0) name += ` +${stars}`;
  }
  return GOVERNOR_GEAR_LEVELS.some((level) => level.tier === name) ? name : '';
}

/** Profile governor_gear string -> six planner tier names (empty string = not in the profile / not mappable). */
export function plannerTiersFromProfile(governorGear) {
  const selections = parseGovernorGearSelections(governorGear);
  return PLANNER_GEAR_SLOT_KEYS.map((key) => profileGearToPlannerTier(selections[key]));
}

/** Apply profile gear to the planner rows; rows without a usable profile value are left untouched. */
export function applyProfileGearToRows(rows, governorGear) {
  const tiers = plannerTiersFromProfile(governorGear);
  return rows.map((row, index) => (tiers[index] ? { ...row, tier: tiers[index] } : row));
}

export function profileHasGear(governorGear) {
  return plannerTiersFromProfile(governorGear).some(Boolean);
}

export function profileGearDiffers(rows, governorGear) {
  const tiers = plannerTiersFromProfile(governorGear);
  return tiers.some((tier, index) => tier && rows?.[index]?.tier !== tier);
}

/** "Level 12" -> 12, 1..22 only; anything else -> null. */
export function parseCharmLevel(value) {
  const level = Number.parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isFinite(level) && level >= 1 && level <= 22 ? level : null;
}

const charmKey = (charm) => `${String(charm.type).toLowerCase()}_${charm.number}`;

/** Apply profile charm levels to planner charms ({type, number, current, target}); the target never drops below the new level. */
export function applyProfileCharms(charms, charmString) {
  const selections = parseCharmSelections(charmString);
  return charms.map((charm) => {
    const level = parseCharmLevel(selections[charmKey(charm)]);
    return level === null ? charm : { ...charm, current: level, target: Math.max(Number(charm.target) || 0, level) };
  });
}

export function profileHasCharms(charmString) {
  const selections = parseCharmSelections(charmString);
  return Object.values(selections).some((value) => parseCharmLevel(value) !== null);
}

export function profileCharmsDiffer(charms, charmString) {
  const selections = parseCharmSelections(charmString);
  return (charms || []).some((charm) => {
    const level = parseCharmLevel(selections[charmKey(charm)]);
    return level !== null && charm.current !== level;
  });
}

/** True when the profile was saved after the tool's own saved state (ISO strings; missing dates never prompt). */
export function profileIsNewer(profileUpdatedAt, toolUpdatedAt) {
  const profile = Date.parse(profileUpdatedAt);
  const tool = Date.parse(toolUpdatedAt);
  return Number.isFinite(profile) && Number.isFinite(tool) && profile > tool;
}
