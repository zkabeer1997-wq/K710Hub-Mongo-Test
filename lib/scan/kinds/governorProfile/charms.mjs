// Reads all 18 charm levels from a Governor Profile screenshot.
import { crop } from '../../normalize.mjs';
import { normToPx } from '../../coords.mjs';
import { readCharmLevel, decodeCharmTemplates, decodeCharmExemplars } from '../../readers/charmReader.mjs';
import { charmRegions } from './layout.mjs';
import { isValidCharmLevel } from './gameData.mjs';
import templatesJson from './charmTemplates.json' with { type: 'json' };
import exemplarsJson from './charmExemplars.json' with { type: 'json' };

export const CHARM_TEMPLATES = decodeCharmTemplates(templatesJson);
export const CHARM_EXEMPLARS = decodeCharmExemplars(exemplarsJson);

/** Levels that have at least one real (in-game screenshot) exemplar, i.e. verified on real screenshots. */
export const CHARM_LEVELS_SEEN_IN_REAL_SCREENSHOTS = [...new Set(CHARM_EXEMPLARS.map((e) => e.level))].sort((a, b) => a - b);

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels full screenshot (RGBA)
 * @param {{ exemplars?: ReturnType<typeof decodeCharmExemplars> }} [options]
 * @returns {{ slot: string, level: { value: number|null, confidence: number, alternatives: object[], flags: string[] } }[]}
 */
export function readGovernorCharms(pixels, { exemplars = CHARM_EXEMPLARS } = {}) {
  // Full-image frame: reference units are fractions of the reference image, see layout.mjs.
  const frame = { x0: 0, y0: 0, scale: pixels.width, aspect: pixels.height / pixels.width };
  return charmRegions().map((region) => {
    const rect = normToPx(region.rect, frame, pixels);
    let level;
    try {
      level = readCharmLevel(crop(pixels, rect), region.troop, CHARM_TEMPLATES, exemplars);
    } catch {
      level = { value: null, confidence: 0, alternatives: [], flags: ['window_outside_image'] };
    }
    if (level.value != null && !isValidCharmLevel(level.value)) level = { ...level, value: null, confidence: 0, flags: [...level.flags, 'invalid_level'] };
    return { slot: region.slot, level };
  });
}
