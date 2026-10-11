// Backpack inventory game data: the items the appointments scheduler ranks by. Facts come from the owner
// (docs/backpack-scan.md); anything not confirmed is left out or marked unknown, never guessed.

/** Resources-tab items we read, by icon. Everything else on the tab (chests, food, wood...) is ignored. */
export const RESOURCE_ITEMS = [
  { id: 'tg', name: 'True Gold (TG)', short: 'TG' },
  { id: 'ttg', name: 'Tempered True Gold (TTG)', short: 'TTG' },
  { id: 'tg_dust', name: 'True Gold Dust (TG Dust)', short: 'TG Dust' },
];
export const RESOURCE_IDS = RESOURCE_ITEMS.map((i) => i.id);

/** Speedup denominations the owner listed, with their value in minutes. */
export const SPEEDUP_DENOMINATIONS = [
  { id: '1m', label: '1 min', minutes: 1, frame: 'grey' },
  { id: '5m', label: '5 min', minutes: 5, frame: 'green' },
  { id: '1h', label: '1 hr', minutes: 60, frame: 'blue' },
];
export const MINUTES_BY_DENOMINATION = Object.fromEntries(SPEEDUP_DENOMINATIONS.map((d) => [d.id, d.minutes]));

/**
 * Category = the small icon bottom-left of the tile. 'healing' is the green plus (owner: healing speedups). It is
 * recognised only so it is not mistaken for another category; it is never shown, counted or saved.
 */
export const SPEEDUP_CATEGORIES = [
  { id: 'general', label: 'General', icon: 'none' },
  { id: 'construction', label: 'Construction', icon: 'hammer' },
  { id: 'research', label: 'Research', icon: 'book and feather' },
  { id: 'troop', label: 'Troop training', icon: 'helmet' },
  { id: 'healing', label: 'Healing', icon: 'green plus' },
];
export const COUNTED_CATEGORIES = ['general', 'construction', 'research', 'troop'];

/** A day is 24 hours. */
export const MINUTES_PER_DAY = 1440;

/** Sanity cap for one quantity (the game shows at most 9 digits on a tile). */
export const MAX_QUANTITY = 999_999_999;

export function isDenomination(id) { return Object.hasOwn(MINUTES_BY_DENOMINATION, id); }
export function isCategory(id) { return SPEEDUP_CATEGORIES.some((c) => c.id === id); }
export function isResourceId(id) { return RESOURCE_IDS.includes(id); }

/** Exact minutes -> days, unrounded (round only for display). */
export function daysFromMinutes(minutes) { return minutes / MINUTES_PER_DAY; }
