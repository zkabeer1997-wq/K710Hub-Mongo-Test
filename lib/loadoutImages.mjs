// Pure path helpers for the owner-supplied Governor Gear / Charm art (see scripts/import-loadout-images.mjs).
// Files live in public/images/loadout and are named from the state, so no manifest import is needed on the client.
import { CHARM_LEVELS, GOVERNOR_GEAR_STATES } from './scan/kinds/governorProfile/gameData.mjs';

export const LOADOUT_IMAGE_BASE = '/images/loadout';
export const LOADOUT_TROOPS = ['cavalry', 'infantry', 'archer'];

/** The only gear slots the owner has art for: one piece per troop folder (hat, shirt, ring). Pendant, pants and baton have none. */
export const HAS_GEAR_ART = Object.freeze({ cavalry_1: true, infantry_1: true, archer_1: true });

const GEAR_KEYS = new Set(GOVERNOR_GEAR_STATES.map((s) => `${s.quality}|${s.tier}|${s.stars}`));

/** 'gold-t3-s2' for a valid state, else null. */
export function gearImageKey(state) {
  if (!state || !GEAR_KEYS.has(`${state.quality}|${state.tier}|${state.stars}`)) return null;
  return `${state.quality}-t${state.tier}-s${state.stars}`;
}

/** Public URL path of the gear art for a slot ('cavalry_1', ...) and { quality, tier, stars }; null for slots without art or no/invalid gear. */
export function gearImageFor(slotKey, state) {
  if (!HAS_GEAR_ART[slotKey]) return null;
  const key = gearImageKey(state);
  if (!key) return null;
  const troop = slotKey.split('_')[0];
  return `${LOADOUT_IMAGE_BASE}/governor-gear/${troop}/${key}.webp`;
}

/** Public URL path of a troop's charm art for a level (number or 'Level 12' / '12'); null when unset or invalid. */
export function charmImageFor(troop, level) {
  const n = Number(String(level ?? '').replace(/^Level\s*/i, '').trim());
  if (!LOADOUT_TROOPS.includes(troop) || !CHARM_LEVELS.includes(n)) return null;
  return `${LOADOUT_IMAGE_BASE}/charms/${troop}/level-${n}.webp`;
}

/** Source file name in the owner's folder: 'Gold 3' (tier 0) or 'Gold T33' (tier 3, 3 stars). */
export function sourceGearFileName(state, qualityName) {
  return state.tier === 0 ? `${qualityName} ${state.stars}.jpg` : `${qualityName} T${state.tier}${state.stars}.jpg`;
}
