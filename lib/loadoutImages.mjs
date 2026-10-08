// Pure path helpers for the owner-supplied Governor Gear / Charm art (see scripts/import-loadout-images.mjs).
// Files live in public/images/loadout and are named from the state, so no manifest import is needed on the client.
import { CHARM_LEVELS, GOVERNOR_GEAR_STATES } from './scan/kinds/governorProfile/gameData.mjs';

export const LOADOUT_IMAGE_BASE = '/images/loadout';
export const LOADOUT_TROOPS = ['cavalry', 'infantry', 'archer'];

/**
 * Gear slot (form key) -> piece and art folder under governor-gear/. All six folders hold the owner's own 384px art
 * (58 states each); scripts/import-loadout-images.mjs builds them and the manifest in one run.
 */
export const GEAR_SLOT_ART = Object.freeze({
  cavalry_1: { piece: 'hat', folder: 'cavalry' },
  cavalry_2: { piece: 'pendant', folder: 'cavalry-2' },
  infantry_1: { piece: 'shirt', folder: 'infantry' },
  infantry_2: { piece: 'pants', folder: 'infantry-2' },
  archer_1: { piece: 'ring', folder: 'archer' },
  archer_2: { piece: 'baton', folder: 'archer-2' },
});

const GEAR_KEYS = new Set(GOVERNOR_GEAR_STATES.map((s) => `${s.quality}|${s.tier}|${s.stars}`));

/** 'gold-t3-s2' for a valid state, else null. */
export function gearImageKey(state) {
  if (!state || !GEAR_KEYS.has(`${state.quality}|${state.tier}|${state.stars}`)) return null;
  return `${state.quality}-t${state.tier}-s${state.stars}`;
}

/** Public URL path of the gear art for a slot ('cavalry_1', ...) and { quality, tier, stars }; null for no gear or an invalid state. */
export function gearImageFor(slotKey, state) {
  const slot = GEAR_SLOT_ART[slotKey];
  const key = gearImageKey(state);
  if (!slot || !key) return null;
  return `${LOADOUT_IMAGE_BASE}/governor-gear/${slot.folder}/${key}.webp`;
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
