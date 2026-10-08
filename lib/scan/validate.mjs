import { getKind } from './kinds/index.mjs';
export { needsReview } from './readingUtils.mjs';

/**
 * Check a reading against the game data of its kind. Returns a copy with lowered confidence and
 * flags such as impossible_state, stars_out_of_range, level_out_of_range, forgery_out_of_range,
 * troop_unknown. NEVER changes a value.
 */
export function validateReading(kind, reading) {
  return getKind(kind).validate(reading);
}
