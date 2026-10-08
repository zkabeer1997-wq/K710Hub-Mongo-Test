// Reads all 18 charm levels from a Governor Profile screenshot.
import { crop } from '../../normalize.mjs';
import { normToPx } from '../../coords.mjs';
import { readCharmLevel, decodeCharmTemplates, decodeCharmExemplars } from '../../readers/charmReader.mjs';
import { charmRegions, charmCentresFromRows, CHARM_WINDOW_HALF, CHARM_PITCH } from './layout.mjs';
import { locateCharmRows } from './locate.mjs';
import { isValidCharmLevel } from './gameData.mjs';
import templatesJson from './charmTemplates.json' with { type: 'json' };
import exemplarsJson from './charmExemplars.json' with { type: 'json' };

export const CHARM_TEMPLATES = decodeCharmTemplates(templatesJson);
export const CHARM_EXEMPLARS = decodeCharmExemplars(exemplarsJson);

/** Levels that have at least one real (in-game screenshot) exemplar, i.e. verified on real screenshots. */
export const CHARM_LEVELS_SEEN_IN_REAL_SCREENSHOTS = [...new Set(CHARM_EXEMPLARS.map((e) => e.level))].sort((a, b) => a - b);

/**
 * Where to look for each charm. The gem rows are found in the image first (so cropped or zoomed images work);
 * if no row can be found the measured full-screenshot layout is used and every window is flagged.
 * @returns {{ slot: string, troop: string, rect: {x:number,y:number,w:number,h:number}, flags: string[] }[]}
 */
export function charmWindows(pixels, { locate = true } = {}) {
  const centres = locate ? charmCentresFromRows(locateCharmRows(pixels)) : null;
  if (centres) {
    return centres.map((c) => {
      const k = c.pitch / CHARM_PITCH;
      return {
        slot: c.slot, troop: c.troop, flags: c.source === 'inferred' ? ['position_inferred'] : [],
        rect: { x: c.cx - CHARM_WINDOW_HALF.w * k, y: c.cy - CHARM_WINDOW_HALF.h * k, w: 2 * CHARM_WINDOW_HALF.w * k, h: 2 * CHARM_WINDOW_HALF.h * k },
      };
    });
  }
  const frame = { x0: 0, y0: 0, scale: pixels.width, aspect: pixels.height / pixels.width };
  return charmRegions().map((r) => ({ slot: r.slot, troop: r.troop, rect: normToPx(r.rect, frame, pixels), flags: ['layout_fixed_fallback'] }));
}

/**
 * Read all 18 charms.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels RGBA image
 * @param {{ exemplars?: ReturnType<typeof decodeCharmExemplars>, locate?: boolean }} [options]
 * @returns {{ slot: string, level: { value: number|null, confidence: number, alternatives: object[], flags: string[] } }[]}
 */
export function readGovernorCharms(pixels, { exemplars = CHARM_EXEMPLARS, locate = true } = {}) {
  return charmWindows(pixels, { locate }).map(({ slot, troop, rect, flags }) => {
    let level;
    try {
      level = readCharmLevel(crop(pixels, rect), troop, CHARM_TEMPLATES, exemplars);
    } catch {
      level = { value: null, confidence: 0, alternatives: [], flags: ['window_outside_image'] };
    }
    if (level.value != null && !isValidCharmLevel(level.value)) level = { ...level, value: null, confidence: 0, flags: [...level.flags, 'invalid_level'] };
    return { slot, level: { ...level, flags: [...flags, ...level.flags] } };
  });
}
