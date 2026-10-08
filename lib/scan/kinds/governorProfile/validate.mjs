import { QUALITIES, maxStars, isValidCharmLevel } from './gameData.mjs';
import { penalize } from '../../readingUtils.mjs';

const IDS = new Set(QUALITIES.map((q) => q.id));

function nullFlag(field) {
  return field && field.value === null ? penalize(field, 'unreadable', 0) : field;
}

/**
 * Governor Gear slot reading { slot, quality, tier, stars } or charm reading { slot, level }.
 * Lowers confidence and adds flags. Never changes a value.
 */
export function validateGovernorProfileReading(reading) {
  if (reading && 'level' in reading && !('quality' in reading)) {
    let level = nullFlag(reading.level);
    if (level.value !== null && !isValidCharmLevel(level.value)) level = penalize(level, 'level_out_of_range');
    return { ...reading, level };
  }
  let { quality, tier, stars } = reading;
  quality = nullFlag(quality); tier = nullFlag(tier); stars = nullFlag(stars);
  if (quality.value !== null && !IDS.has(quality.value)) {
    quality = penalize(quality, 'quality_unknown');
  } else if (quality.value !== null && tier.value !== null) {
    const max = maxStars(quality.value, tier.value);
    if (max === null) {
      quality = penalize(quality, 'impossible_state');
      tier = penalize(tier, 'impossible_state');
    } else if (stars.value !== null && (!Number.isInteger(stars.value) || stars.value < 0 || stars.value > max)) {
      stars = penalize(stars, 'stars_out_of_range');
    }
  }
  return { ...reading, quality, tier, stars };
}
