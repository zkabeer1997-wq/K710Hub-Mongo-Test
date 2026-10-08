// Governor Gear tile reader: one gear piece on the Governor Profile (a rounded square with a quality-coloured
// frame, a "T3"-style tier label top-left, 0-3 stars down the left edge and a red notification dot top-right).
//   quality: colour of the frame (green / blue / purple / gold(=Mythic, orange) / red(=Legendary))
//   tier:    the "T<n>" label; no label means T0
//   stars:   star icons in three fixed spots up the left edge, filled from the bottom
// Templates come from the owner's art (scripts/build-gear-templates.mjs). Pure and runtime-agnostic.
// Nothing is guessed: weak or ambiguous reads lower the confidence and list alternatives.
import { resizeTo, crop } from '../normalize.mjs';

export const TILE_GRID = 96;
export const LABEL_W = 18;
export const LABEL_H = 12;
/** Label search box on the 96 x 96 tile grid (x0, y0, x1, y1). */
export const LABEL_BOX = [10, 4, 45, 27];
/** The three star spots (x0, y0, x1, y1) on the 96 x 96 grid, bottom star first. Measured on the art. */
export const STAR_BOXES = [[10, 69, 27, 86], [10, 51, 27, 67], [10, 33, 27, 49]];
/** Frame sample bands on the grid: along the bottom edge and the lower right edge (away from label, stars and dot). */
const RING_BANDS = [[24, 84, 72, 90], [84, 36, 90, 72]];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function hsvOf(r, g, b) {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const median = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** Normalised 96 x 96 view of a tile crop. */
export function normaliseTile(tilePixels) {
  return resizeTo(tilePixels, TILE_GRID, TILE_GRID);
}

/** Frame colour: median RGB of the frame bands, as HSV. */
export function frameColour(tile) {
  const rs = []; const gs = []; const bs = [];
  for (const [x0, y0, x1, y1] of RING_BANDS) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = (y * TILE_GRID + x) * 4;
        rs.push(tile.data[i]); gs.push(tile.data[i + 1]); bs.push(tile.data[i + 2]);
      }
    }
  }
  return hsvOf(median(rs), median(gs), median(bs));
}

/**
 * Soft "yellow" weight of a pixel (0-1): the lemon of tier labels and stars, between orange (hue ~30) and green.
 * Soft, not a hard cut, because in-game screenshots are blurrier than the art.
 */
export function yellowWeight(r, g, b) {
  const [h, s, v] = hsvOf(r, g, b);
  if (h < 36 || h > 62 || s < 0.3 || v < 0.7) return 0;
  return Math.min(1, (s - 0.25) / 0.35) * Math.min(1, (v - 0.65) / 0.25);
}

/** Label map (LABEL_W x LABEL_H, soft yellow coverage) of the label box. */
export function labelMask(tile) {
  const [x0, y0, x1, y1] = LABEL_BOX;
  const cw = (x1 - x0 + 1) / LABEL_W; const ch = (y1 - y0 + 1) / LABEL_H;
  const cov = new Float32Array(LABEL_W * LABEL_H); const cnt = new Float32Array(LABEL_W * LABEL_H);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const c = Math.min(LABEL_H - 1, Math.floor((y - y0) / ch)) * LABEL_W + Math.min(LABEL_W - 1, Math.floor((x - x0) / cw));
      const i = (y * TILE_GRID + x) * 4;
      cnt[c] += 1; cov[c] += yellowWeight(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
    }
  }
  let area = 0;
  for (let c = 0; c < cov.length; c += 1) { cov[c] = cnt[c] ? cov[c] / cnt[c] : 0; area += cov[c]; }
  return { mask: cov, area };
}

/** Side of the square window used to look for one star (centre +- 11 px, so shifts up to 3 px are covered). */
export const STAR_WINDOW = 23;
const STAR_SHIFT = 3;

/** Soft yellow map of a STAR_WINDOW x STAR_WINDOW window centred on (cx, cy) of the 96 grid. */
export function starMap(tile, cx, cy) {
  const M = STAR_WINDOW; const h = (M - 1) / 2;
  const m = new Float32Array(M * M);
  for (let dy = -h; dy <= h; dy += 1) {
    for (let dx = -h; dx <= h; dx += 1) {
      const x = Math.round(cx) + dx; const y = Math.round(cy) + dy;
      if (x >= 0 && y >= 0 && x < TILE_GRID && y < TILE_GRID) {
        const i = (y * TILE_GRID + x) * 4;
        m[(dy + h) * M + dx + h] = yellowWeight(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
      }
    }
  }
  return m;
}

function nccOf(a, b) {
  let sa = 0; let sb = 0; const n = a.length;
  for (let i = 0; i < n; i += 1) { sa += a[i]; sb += b[i]; }
  const ma = sa / n; const mb = sb / n; let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) { const x = a[i] - ma; const y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * How star-like each star spot looks: best correlation (allowing a few px shift) between the spot's yellow map
 * and the star template. A star is a solid star-shaped blob; gold item art that spills into a spot is not.
 */
export function starScores(tile, starTemplate) {
  return STAR_BOXES.map(([x0, y0, x1, y1]) => {
    let best = -1;
    for (let sy = -STAR_SHIFT; sy <= STAR_SHIFT; sy += 1) {
      for (let sx = -STAR_SHIFT; sx <= STAR_SHIFT; sx += 1) {
        const c = nccOf(starMap(tile, (x0 + x1) / 2 + sx, (y0 + y1) / 2 + sy), starTemplate);
        if (c > best) best = c;
      }
    }
    return best;
  });
}

/** Frame colour and label map for one 96 x 96 tile (used by the template builder too). */
export function tileFeatures(tile) {
  return { frame: frameColour(tile), label: labelMask(tile) };
}

function corrPlain(a, b) {
  let sa = 0; let sb = 0; const n = a.length;
  for (let i = 0; i < n; i += 1) { sa += a[i]; sb += b[i]; }
  const ma = sa / n; const mb = sb / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) { const x = a[i] - ma; const y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Correlation of two label maps, best over small shifts (the text sits a cell or two off between art and game). */
export function labelCorr(obs, tpl, shift = 2) {
  let best = -1;
  for (let dy = -shift; dy <= shift; dy += 1) {
    for (let dx = -shift; dx <= shift; dx += 1) {
      const moved = new Float32Array(LABEL_W * LABEL_H);
      for (let y = 0; y < LABEL_H; y += 1) {
        for (let x = 0; x < LABEL_W; x += 1) {
          const sx = x + dx; const sy = y + dy;
          if (sx >= 0 && sy >= 0 && sx < LABEL_W && sy < LABEL_H) moved[y * LABEL_W + x] = obs[sy * LABEL_W + sx];
        }
      }
      const c = corrPlain(moved, tpl);
      if (c > best) best = c;
    }
  }
  return best;
}

const decode = (b64) => { const bin = atob(b64); const o = new Float32Array(bin.length); for (let i = 0; i < bin.length; i += 1) o[i] = bin.charCodeAt(i) / 255; return o; };

/** Turn gearTemplates.json into { frames: [{ quality, h, s, v }], labels: [{ tier, mask }], starFill: { on, off } }. */
export function decodeGearTemplates(json) {
  if (!json || json.version !== 1) throw new RangeError('unknown gear template version');
  return {
    frames: json.frames,
    labels: json.labels.map((l) => ({ id: l.id, tier: l.tier, source: l.source, hasReal: l.hasReal, mask: decode(l.mask) })),
    // the builder imports this module before the first real template exists: tolerate an empty star template
    star: { template: json.star?.template ? decode(json.star.template) : new Float32Array(STAR_WINDOW * STAR_WINDOW), threshold: json.star?.threshold ?? 1 },
    noLabelCorr: json.noLabelCorr ?? 0.4,
  };
}

function field(value, confidence, alternatives = [], flags = []) {
  return { value, confidence: Number(clamp01(confidence).toFixed(3)), alternatives, flags };
}

/**
 * Read one gear tile.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} tilePixels crop of the tile (any size, roughly square)
 * @param {ReturnType<typeof decodeGearTemplates>} templates
 */
export function readGearTile(tilePixels, templates) {
  const tile = normaliseTile(tilePixels);
  const f = tileFeatures(tile);

  // quality: nearest frame colour (hue first, saturation second)
  const ranked = templates.frames.map((fr) => ({
    quality: fr.quality,
    d: hueGap(f.frame[0], fr.h) / 60 + Math.abs(f.frame[1] - fr.s) * 0.6 + Math.abs(f.frame[2] - fr.v) * 0.3,
  })).sort((a, b) => a.d - b.d);
  const qGap = ranked[1].d - ranked[0].d;
  const qFlags = [];
  if (qGap < 0.25) qFlags.push('close_second_choice');
  const quality = field(ranked[0].quality, 0.4 + qGap * 1.2, ranked.slice(1, 3).map((r) => ({ value: r.quality, confidence: Number(clamp01(1 - r.d).toFixed(3)) })), qFlags);

  // tier: no label text = T0, otherwise the best matching label template
  let tier;
  const scored = templates.labels.map((l) => ({ l, c: labelCorr(f.label.mask, l.mask) })).sort((a, b) => b.c - a.c);
  if (scored[0].c < templates.noLabelCorr) {
    tier = field(0, clamp01(0.55 + (templates.noLabelCorr - scored[0].c) * 1.5), [{ value: scored[0].l.tier, confidence: Number(clamp01(scored[0].c).toFixed(3)) }], scored[0].c > templates.noLabelCorr - 0.08 ? ['close_second_choice'] : []);
  } else if (scored[0].l.tier == null) {
    // a label that is not "T<n>" (the game also shows e.g. "P1" / "P2"): not in the confirmed tier list, so no value
    tier = field(null, 0.3, scored.slice(1, 3).filter((x) => x.l.tier != null).map((x) => ({ value: x.l.tier, confidence: Number(clamp01(x.c).toFixed(3)) })), [`unrecognised_tier_label_${scored[0].l.id}`]);
  } else {
    // runner-up = best template of a DIFFERENT tier (the art and real template of the same tier agree by design)
    const other = scored.find((x) => x.l.id !== scored[0].l.id) ?? scored[1];
    const gap = scored[0].c - other.c;
    const flags = [];
    if (gap < 0.12) flags.push('close_second_choice');
    const artOnly = !scored[0].l.hasReal;
    if (artOnly) flags.push('tier_matched_on_art_only');
    tier = field(scored[0].l.tier, clamp01(scored[0].c) * Math.min(1, 0.6 + gap * 2.5) * (artOnly ? 0.85 : 1), [...new Map(scored.filter((x) => x.l.tier != null && x.l.tier !== scored[0].l.tier).map((x) => [x.l.tier, { value: x.l.tier, confidence: Number(clamp01(x.c).toFixed(3)) }])).values()].slice(0, 2), flags);
  }

  // stars: filled from the bottom; a star above an empty spot is impossible, so it lowers confidence
  const sc = starScores(tile, templates.star.template);
  const on = sc.map((v) => v >= templates.star.threshold);
  let count = 0; while (count < 3 && on[count]) count += 1;
  const flags = [];
  let conf = 0.97;
  if (on.slice(count).some(Boolean)) { flags.push('star_gap'); conf = 0.45; }
  // a score close to the decision line in any spot lowers confidence
  const edge = Math.min(...sc.map((v) => Math.abs(v - templates.star.threshold)));
  if (edge < 0.08) { flags.push('faint_star_evidence'); conf = Math.min(conf, 0.5 + edge * 3); }
  const stars = field(count, conf, [], flags);

  return { quality, tier, stars, features: { ...f, starScores: sc } };
}

/** Crop a tile rect (pixels) out of a full image, clamped. */
export function cropTile(pixels, rect) {
  return crop(pixels, rect);
}
