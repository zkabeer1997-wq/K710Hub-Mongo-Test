// Governor Gear / Charm taxonomy for the Governor Profile scan.
// Source: labels and ranges confirmed in docs/scan-engine-plan.md (Update 2), mirrored by
// lib/equipmentOptions.mjs (GOVERNOR_GEAR_OPTIONS). tests/scanGameData.test.mjs keeps both in lock-step.
import { GOVERNOR_GEAR_OCR_SLOTS, CHARM_OCR_PIECE_BASE } from '../../../governorGearOcr.mjs';

/**
 * Qualities. `tiers` lists every tier with its max stars (stars run 0..maxStars).
 * `starStyle` is only how the existing option strings are spelled: 'text' = "2 stars", 'glyph' = star characters.
 */
export const QUALITIES = [
  { id: 'green', name: 'Green', starStyle: 'text', tiers: [{ tier: 0, maxStars: 1 }] },
  { id: 'blue', name: 'Blue', starStyle: 'text', tiers: [{ tier: 0, maxStars: 3 }] },
  { id: 'purple', name: 'Purple', starStyle: 'text', tiers: [{ tier: 0, maxStars: 3 }, { tier: 1, maxStars: 3 }] },
  { id: 'gold', name: 'Gold', starStyle: 'glyph', tiers: [0, 1, 2, 3].map((tier) => ({ tier, maxStars: 3 })) },
  { id: 'red', name: 'Red', starStyle: 'glyph', tiers: [0, 1, 2, 3, 4, 5, 6].map((tier) => ({ tier, maxStars: 3 })) },
];

const BY_ID = new Map(QUALITIES.map((q) => [q.id, q]));

/** @returns {number|null} max stars for a quality id + tier, or null when that combination does not exist. */
export function maxStars(quality, tier) {
  const q = BY_ID.get(quality);
  const t = q?.tiers.find((x) => x.tier === tier);
  return t ? t.maxStars : null;
}

export function isValidGearState(quality, tier, stars) {
  const max = maxStars(quality, tier);
  return max !== null && Number.isInteger(stars) && stars >= 0 && stars <= max;
}

/** The option string used by the existing forms, e.g. "Gold T2 ★★". */
export function labelFor(state) {
  const q = BY_ID.get(state.quality);
  const base = state.tier === 0 ? q.name : `${q.name} T${state.tier}`;
  if (state.stars === 0) return base;
  if (q.starStyle === 'glyph') return `${base} ${'★'.repeat(state.stars)}`;
  return `${base} ${state.stars} ${state.stars === 1 ? 'star' : 'stars'}`;
}

/** @type {{quality:string,tier:number,stars:number,label:string}[]} all 58 states, in GOVERNOR_GEAR_OPTIONS order. */
export const GOVERNOR_GEAR_STATES = QUALITIES.flatMap((q) => q.tiers.flatMap(({ tier, maxStars: m }) => (
  Array.from({ length: m + 1 }, (_, stars) => {
    const state = { quality: q.id, tier, stars };
    return { ...state, label: labelFor(state) };
  })
)));
/** Alias matching the requested name. */
export const GOVERNOR_GEAR_STATE_LIST = GOVERNOR_GEAR_STATES;

/** The six piece keys as used by the OCR layer. Each maps to a form slot (cavalry_1 ...). */
export const GEAR_SLOTS = Object.keys(GOVERNOR_GEAR_OCR_SLOTS);
export const GEAR_SLOT_FORM_KEYS = { ...GOVERNOR_GEAR_OCR_SLOTS };

export const CHARM_LEVELS = Array.from({ length: 22 }, (_, i) => i + 1);
export const CHARMS_PER_PIECE = 3;

/** 18 form slot keys: infantry_1..6, cavalry_1..6, archer_1..6 (3 per gear piece, via CHARM_OCR_PIECE_BASE). */
export const CHARM_SLOTS = Object.values(CHARM_OCR_PIECE_BASE)
  .flatMap(({ troop, offset }) => Array.from({ length: CHARMS_PER_PIECE }, (_, i) => `${troop}_${offset + i + 1}`))
  .sort();

export function isValidCharmLevel(level) {
  return Number.isInteger(level) && level >= CHARM_LEVELS[0] && level <= CHARM_LEVELS[CHARM_LEVELS.length - 1];
}

/** Frame colours per quality. NOT MEASURED YET: to be filled from labelled screenshots, never guessed. */
export const QUALITY_PALETTE_STATUS = 'unmeasured';
/** @type {{ id: string, hsv: {h:number,s:number,v:number}, tolerance?: number }[]} */
export const QUALITY_PALETTE = [];

/** TODO(owner): charm shape templates (level is drawn as a shape). Unknown until fixtures exist. */
export const CHARM_SHAPE_TEMPLATES_STATUS = 'unknown';
