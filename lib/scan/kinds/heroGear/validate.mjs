import { TROOPS, isValidHeroGearLevel, isValidForgery, rarityForLevel } from './gameData.mjs';
import { penalize } from '../../readingUtils.mjs';

const unreadable = (f) => (f && f.value === null ? penalize(f, 'unreadable', 0) : f);

/** Hero gear piece { troop, rarity, level, forgery }. Lowers confidence, adds flags, never changes values. */
export function validateBackpackGearReading(reading) {
  let { troop, rarity, level, forgery } = reading;
  troop = unreadable(troop); rarity = unreadable(rarity); level = unreadable(level); forgery = unreadable(forgery);
  if (troop.value !== null && !TROOPS.includes(troop.value)) troop = penalize(troop, 'troop_unknown');
  if (level.value !== null && !isValidHeroGearLevel(level.value)) level = penalize(level, 'level_out_of_range');
  if (forgery.value !== null && !isValidForgery(forgery.value)) forgery = penalize(forgery, 'forgery_out_of_range');
  if (rarity?.value != null && level.value !== null) {
    const expected = rarityForLevel(level.value);
    if (expected !== 'unknown' && expected !== rarity.value) {
      rarity = penalize(rarity, 'rarity_level_mismatch');
      level = penalize(level, 'rarity_level_mismatch');
    }
  }
  return { ...reading, troop, rarity, level, forgery };
}
