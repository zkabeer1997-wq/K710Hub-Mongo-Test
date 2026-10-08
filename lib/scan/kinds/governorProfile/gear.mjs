// Reads the six Governor Gear tiles from a Governor Profile image.
// Each tile sits straight above the middle gem of its charm row, so the tile follows wherever the charm rows were
// found (works on cropped / zoomed images too). Offsets measured on the owner's 1284 x 2778 screenshots, in
// reference pixels at a gem pitch of 60 px: tile centre 125 px above the middle gem, tile 186 px wide and tall.
import { crop } from '../../normalize.mjs';
import { decodeGearTemplates, readGearTile } from '../../readers/gearTileReader.mjs';
import { charmCentresFromRows, CHARM_PITCH } from './layout.mjs';
import { locateCharmRows } from './locate.mjs';
import { GEAR_SLOTS } from './gameData.mjs';
import templatesJson from './gearTemplates.json' with { type: 'json' };

export const GEAR_TEMPLATES = decodeGearTemplates(templatesJson);
export const TILE_ABOVE_GEM = 125;
export const TILE_SIZE = 186;

/** piece -> { rect, flags } from the located charm rows; null when no charm row was found. */
export function gearWindows(pixels, located = locateCharmRows(pixels)) {
  const centres = charmCentresFromRows(located);
  if (!centres) return null;
  const out = {};
  for (const piece of GEAR_SLOTS) {
    const gems = centres.filter((c) => c.piece === piece);
    if (gems.length !== 3) continue;
    const mid = gems[1];
    const k = mid.pitch / CHARM_PITCH;
    out[piece] = {
      flags: mid.source === 'inferred' ? ['position_inferred'] : [],
      rect: { x: mid.cx - (TILE_SIZE / 2) * k, y: mid.cy - (TILE_ABOVE_GEM + TILE_SIZE / 2) * k, w: TILE_SIZE * k, h: TILE_SIZE * k },
    };
  }
  return out;
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels RGBA image
 * @returns {{ slot: string, quality: object, tier: object, stars: object }[]}
 */
export function readGovernorGear(pixels, located) {
  const windows = gearWindows(pixels, located);
  return GEAR_SLOTS.map((slot) => {
    const w = windows?.[slot];
    const empty = (flag) => ({ value: null, confidence: 0, alternatives: [], flags: [flag] });
    if (!w) return { slot, quality: empty('tile_not_found'), tier: empty('tile_not_found'), stars: empty('tile_not_found') };
    let tile;
    try { tile = crop(pixels, w.rect); } catch { return { slot, quality: empty('tile_outside_image'), tier: empty('tile_outside_image'), stars: empty('tile_outside_image') }; }
    const r = readGearTile(tile, GEAR_TEMPLATES);
    const add = (f) => ({ ...f, flags: [...w.flags, ...f.flags] });
    return { slot, quality: add(r.quality), tier: add(r.tier), stars: add(r.stars) };
  });
}
