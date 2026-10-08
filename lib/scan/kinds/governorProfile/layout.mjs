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

/** troop + side of a detected gem row -> gear piece. */
export const ROW_PIECE = {
  cavalry_left: 'hat', cavalry_right: 'pendant',
  infantry_left: 'shirt', infantry_right: 'pants',
  archer_left: 'ring', archer_right: 'baton',
};

/**
 * Centres of all 18 gems from the detected rows. Detected rows are used as they are; a row that was not found is
 * inferred from the detected ones using the measured layout (offsets in gem-pitch units), so a stray colour in
 * the artwork behind a gem row does not lose that row. Returns null when no row was detected.
 * @returns {{ slot: string, troop: string, piece: string, cx: number, cy: number, pitch: number, source: 'detected'|'inferred' }[] | null}
 */
export function charmCentresFromRows(located) {
  const { rows } = located;
  if (!rows.length) return null;
  const pitch = located.scale;
  const out = [];
  for (const [rowKey, piece] of Object.entries(ROW_PIECE)) {
    const [troop, side] = rowKey.split('_');
    const { offset } = CHARM_OCR_PIECE_BASE[piece];
    const detected = rows.find((r) => r.troop === troop && r.side === side);
    let mid; let source;
    if (detected) { mid = detected.centres[1]; source = 'detected'; } else {
      // predict from the nearest detected row (same troop first, then any)
      const anchor = rows.find((r) => r.troop === troop) || rows[0];
      const aPiece = ROW_PIECE[`${anchor.troop}_${anchor.side}`];
      const k = pitch / CHARM_PITCH;
      mid = {
        x: anchor.centres[1].x + (PIECE_CENTRE[piece].x - PIECE_CENTRE[aPiece].x) * k,
        y: anchor.centres[1].y + (PIECE_CENTRE[piece].y - PIECE_CENTRE[aPiece].y) * k,
      };
      source = 'inferred';
    }
    const p = detected ? detected.pitch : pitch;
    for (let i = 0; i < 3; i += 1) {
      out.push({ slot: `${troop}_${offset + i + 1}`, troop, piece, cx: mid.x + (i - 1) * p, cy: detected ? detected.centres[i].y : mid.y, pitch: p, source });
    }
  }
  return out;
}

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
