// Backpack > Gear tab = HERO gear pieces. Ranges from docs/scan-engine-plan.md (Update 2).

export const TROOPS = ['infantry', 'cavalry', 'archer'];

/** Icon in the top-left of each piece. */
export const TROOP_ICONS = { shield: 'infantry', horse: 'cavalry', crossbow: 'archer' };

export const HERO_GEAR_LEVEL_MIN = 1;
export const HERO_GEAR_LEVEL_MAX = 200;
export const GOLD_MAX_LEVEL = 100;

/**
 * Rarity from level, as told by the owner: gold 1-100, red 101-200.
 * Lower rarities exist (the reference says epic max 80) but are NOT confirmed for the backpack tab,
 * so anything else is 'unknown' rather than a guess.
 */
export function rarityForLevel(level) {
  if (!Number.isInteger(level)) return 'unknown';
  if (level >= HERO_GEAR_LEVEL_MIN && level <= GOLD_MAX_LEVEL) return 'gold';
  if (level > GOLD_MAX_LEVEL && level <= HERO_GEAR_LEVEL_MAX) return 'red';
  return 'unknown';
}

export function isValidHeroGearLevel(level) {
  return Number.isInteger(level) && level >= HERO_GEAR_LEVEL_MIN && level <= HERO_GEAR_LEVEL_MAX;
}

// Field name is `forgery`. The reference site calls this value "Mastery"; the word the game
// shows on screen is UNCONFIRMED (TODO(owner)).
export const FORGERY_MIN = 0;
export const FORGERY_MAX = 20;
export const FORGERY_ON_SCREEN_WORD_STATUS = 'unknown';

export function isValidForgery(value) {
  return Number.isInteger(value) && value >= FORGERY_MIN && value <= FORGERY_MAX;
}

export function troopForIcon(icon) {
  return TROOP_ICONS[icon] ?? null;
}
