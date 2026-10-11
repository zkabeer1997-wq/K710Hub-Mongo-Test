import { MAX_QUANTITY, isDenomination, isCategory } from './gameData.mjs';
import { penalize } from '../../readingUtils.mjs';

/**
 * Speedup row { denomination, category, quantity } checked against game data. Lowers confidence and adds flags;
 * NEVER changes a value.
 */
export function validateBackpackInventoryReading(reading) {
  let { denomination, category, quantity } = reading;
  if (denomination && denomination.value !== null && !isDenomination(denomination.value)) denomination = penalize(denomination, 'denomination_unknown');
  if (category && category.value !== null && !isCategory(category.value)) category = penalize(category, 'category_unknown');
  if (quantity && quantity.value !== null && (!Number.isInteger(quantity.value) || quantity.value < 0 || quantity.value > MAX_QUANTITY)) quantity = penalize(quantity, 'quantity_out_of_range');
  return { ...reading, denomination, category, quantity };
}
