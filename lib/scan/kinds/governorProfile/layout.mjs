// Where the 18 charm gems sit on the Governor Profile screen.
// MEASURED from the owner's two 1284x2778 screenshots (identical layouts; gem pitch 60 px).
// Provisional: one device so far. Reference units = fractions of the reference image width/height
// (see lib/scan/coords.mjs), so they scale to other resolutions of the same screen.
import { CHARM_OCR_PIECE_BASE } from '../../../governorGearOcr.mjs';

export const REF_WIDTH = 1284;
export const REF_HEIGHT = 2778;
/** Half-size of the window cut around each gem, in reference pixels (1284 wide). */
export const CHARM_WINDOW_HALF = { w: 33, h: 34 };

/** Centre of the middle gem of each gear piece, reference pixels. The other two are -60 / +60 px in x. */
const PIECE_CENTRE = {
  hat: { x: 212, y: 795 },
  pendant: { x: 1070, y: 795 },
  shirt: { x: 128, y: 1112 },
  pants: { x: 1155, y: 1112 },
  ring: { x: 212, y: 1412 },
  baton: { x: 1070, y: 1412 },
};
export const CHARM_PITCH = 60;

/** { slot: 'cavalry_1', troop, piece, rect } for all 18 charms; rect in reference units (0-1). */
export function charmRegions() {
  const out = [];
  for (const [piece, { troop, offset }] of Object.entries(CHARM_OCR_PIECE_BASE)) {
    const c = PIECE_CENTRE[piece];
    for (let i = 0; i < 3; i += 1) {
      const cx = c.x + (i - 1) * CHARM_PITCH;
      out.push({
        slot: `${troop}_${offset + i + 1}`, troop, piece,
        rect: {
          x: (cx - CHARM_WINDOW_HALF.w) / REF_WIDTH, y: (c.y - CHARM_WINDOW_HALF.h) / REF_HEIGHT,
          w: (2 * CHARM_WINDOW_HALF.w) / REF_WIDTH, h: (2 * CHARM_WINDOW_HALF.h) / REF_HEIGHT,
        },
      });
    }
  }
  return out;
}
