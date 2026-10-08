// Pure helpers for the Power Profile "loadout" (visual board + table).
//
// The loadout is a different VIEW of the existing stored data, never a new format. State stays the
// same two maps the form always used (see lib/powerProfiles.mjs):
//   gear   : { cavalry_1: 'Gold T3 ★★', ... }      -> power_profiles.governor_gear  ("Cavalry 1: Gold T3 ★★ | ...")
//   charms : { cavalry_1: 'Level 12', ... }        -> power_profiles.charms         ("Cavalry Charm 1: Level 12 | ...")
// parse/serialize in lib/powerProfiles.mjs are the only code that turns those maps into strings.
import { CHARM_OCR_PIECE_BASE, GOVERNOR_GEAR_OCR_SLOTS } from './governorGearOcr.mjs';
import {
  CHARMS_PER_PIECE,
  GOVERNOR_GEAR_STATES,
  QUALITIES,
  labelFor,
  maxStars,
} from './scan/kinds/governorProfile/gameData.mjs';

/** Board order: left column top to bottom, then right column top to bottom. */
export const LOADOUT_PIECES = [
  { id: 'hat', name: 'Hat', side: 'left' },
  { id: 'shirt', name: 'Shirt', side: 'left' },
  { id: 'ring', name: 'Ring', side: 'left' },
  { id: 'pendant', name: 'Pendant', side: 'right' },
  { id: 'pants', name: 'Pants', side: 'right' },
  { id: 'baton', name: 'Baton', side: 'right' },
].map((piece) => {
  const { troop, offset } = CHARM_OCR_PIECE_BASE[piece.id];
  return {
    ...piece,
    troop,
    troopName: troop[0].toUpperCase() + troop.slice(1),
    gearKey: GOVERNOR_GEAR_OCR_SLOTS[piece.id], // e.g. cavalry_1
    charmKeys: Array.from({ length: CHARMS_PER_PIECE }, (_, i) => `${troop}_${offset + i + 1}`),
  };
});

export const LOADOUT_GEAR_TOTAL = LOADOUT_PIECES.length;
export const LOADOUT_CHARM_TOTAL = LOADOUT_PIECES.length * CHARMS_PER_PIECE;

const STATE_BY_LABEL = new Map(GOVERNOR_GEAR_STATES.map((state) => [state.label, state]));
const QUALITY_BY_ID = new Map(QUALITIES.map((q) => [q.id, q]));

/** Stored gear string -> { quality, tier, stars } or null when blank/unrecognised. */
export function parseGearValue(value) {
  const state = STATE_BY_LABEL.get(String(value || '').trim());
  return state ? { quality: state.quality, tier: state.tier, stars: state.stars } : null;
}

/** { quality, tier, stars } -> stored option string ('' when there is no quality). Clamps to what exists. */
export function composeGearValue({ quality, tier = 0, stars = 0 } = {}) {
  const q = QUALITY_BY_ID.get(quality);
  if (!q) return '';
  const tiers = q.tiers.map((t) => t.tier);
  const safeTier = tiers.includes(tier) ? tier : tiers[0];
  const cap = maxStars(quality, safeTier) ?? 0;
  const safeStars = Math.max(0, Math.min(cap, Number.isInteger(stars) ? stars : 0));
  return labelFor({ quality, tier: safeTier, stars: safeStars });
}

/** New stored value after editing one part of a row. `part` is 'quality' | 'tier' | 'stars'. */
export function editGearValue(current, part, raw) {
  const parsed = parseGearValue(current) || { quality: '', tier: 0, stars: 0 };
  if (part === 'quality') {
    if (!raw) return '';
    return composeGearValue({ quality: raw, tier: parsed.quality ? parsed.tier : 0, stars: parsed.stars });
  }
  if (!parsed.quality) return '';
  if (part === 'tier') return composeGearValue({ ...parsed, tier: Number(raw) });
  if (part === 'stars') return composeGearValue({ ...parsed, stars: Number(raw) });
  return current;
}

export function tiersFor(quality) {
  return (QUALITY_BY_ID.get(quality)?.tiers || []).map((t) => t.tier);
}

export function starsFor(quality, tier) {
  const cap = maxStars(quality, tier);
  return cap === null ? [] : Array.from({ length: cap + 1 }, (_, i) => i);
}

export function tierLabel(tier) {
  return tier === 0 ? 'Base' : `T${tier}`;
}

export function starsLabel(stars) {
  return stars === 0 ? 'No stars' : `${stars} ${stars === 1 ? 'star' : 'stars'}`;
}

/** 'Gold T3, 2 stars' / 'Gold, no stars' / '' for blank. Unrecognised saved text is returned as is. */
export function gearSpoken(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = parseGearValue(text);
  if (!parsed) return text;
  const name = QUALITY_BY_ID.get(parsed.quality).name;
  const base = parsed.tier ? `${name} T${parsed.tier}` : name;
  return `${base}, ${parsed.stars === 0 ? 'no stars' : starsLabel(parsed.stars)}`;
}

/** Tile label, e.g. 'Cavalry hat: Gold T3, 2 stars'. */
export function gearAriaLabel(piece, value) {
  const spoken = gearSpoken(value);
  return `${piece.troopName} ${piece.name.toLowerCase()}: ${spoken || 'no gear'}`;
}

export function charmSpoken(value) {
  return String(value || '').trim() || 'not set';
}

/** 'Cavalry hat charm 2: Level 12' */
export function charmAriaLabel(piece, index, value) {
  return `${piece.troopName} ${piece.name.toLowerCase()} charm ${index + 1}: ${charmSpoken(value)}`;
}

/** Live-region sentence after a gear edit: 'Hat set to Gold T3, 2 stars' / 'Hat cleared'. */
export function gearAnnouncement(piece, value) {
  const spoken = gearSpoken(value);
  return spoken ? `${piece.name} set to ${spoken}` : `${piece.name} cleared`;
}

export function charmAnnouncement(piece, index, value) {
  const text = String(value || '').trim();
  return text ? `${piece.name} charm ${index + 1} set to ${text}` : `${piece.name} charm ${index + 1} cleared`;
}

export function loadoutCounts(gear, charms) {
  const filled = (v) => Boolean(String(v || '').trim());
  return {
    gear: LOADOUT_PIECES.filter((p) => filled(gear?.[p.gearKey])).length,
    charms: LOADOUT_PIECES.reduce((n, p) => n + p.charmKeys.filter((k) => filled(charms?.[k])).length, 0),
  };
}

export function completionText(gear, charms) {
  const c = loadoutCounts(gear, charms);
  return `Governor Gear: ${c.gear} of ${LOADOUT_GEAR_TOTAL} slots · Charms: ${c.charms} of ${LOADOUT_CHARM_TOTAL}`;
}

/** Compact lines for the Review step: one per piece. */
export function reviewLines(gear, charms) {
  return LOADOUT_PIECES.map((piece) => ({
    id: piece.id,
    name: `${piece.name} (${piece.troopName})`,
    gear: String(gear?.[piece.gearKey] || '').trim() || 'No gear',
    charms: piece.charmKeys.map((k) => String(charms?.[k] || '').replace(/^Level\s*/, '').trim() || '-').join(' / '),
  }));
}
