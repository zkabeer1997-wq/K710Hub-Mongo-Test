// Colour maths. No palettes for real game qualities live here (they are unmeasured).

/** Distance weights. Hue matters most; value (brightness) varies with lighting, so least. */
export const HUE_WEIGHT = 2;
export const SAT_WEIGHT = 1;
export const VAL_WEIGHT = 0.5;
/** Hue is meaningless for near-grey colours: its weight is scaled by min(s1, s2) clamped to at least this. */
export const MIN_HUE_SATURATION_SCALE = 0.1;
/** Default palette tolerance (distance at which confidence reaches 0). */
export const DEFAULT_TOLERANCE = 0.25;
/** Margin to the second best (distance units) at which the margin factor reaches 1. */
export const MARGIN_FULL = 0.15;
/** Margin factor when the best and second best are tied. */
export const MARGIN_FLOOR = 0.2;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** @returns {{h:number,s:number,v:number}} h in degrees [0,360), s and v in [0,1] */
export function rgbToHsv(r, g, b) {
  const rn = r / 255; const gn = g / 255; const bn = b / 255;
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Weighted HSV distance in [0,1]. Hue difference is circular (350 deg vs 10 deg = 20 deg).
 * sqrt( (wh*dh^2 + ws*ds^2 + wv*dv^2) / (wh+ws+wv) ) with dh, ds, dv each normalised to [0,1].
 */
export function hsvDistance(a, b) {
  const raw = Math.abs(a.h - b.h) % 360;
  const dh = Math.min(raw, 360 - raw) / 180;
  const ds = Math.abs(a.s - b.s);
  const dv = Math.abs(a.v - b.v);
  const hw = HUE_WEIGHT * Math.max(MIN_HUE_SATURATION_SCALE, Math.min(a.s, b.s));
  return Math.sqrt((hw * dh * dh + SAT_WEIGHT * ds * ds + VAL_WEIGHT * dv * dv) / (hw + SAT_WEIGHT + VAL_WEIGHT));
}

/**
 * Trimmed-mean colour of a pixel rect {x,y,w,h}. Pixels with alpha < minAlpha are ignored.
 * `trim` is the fraction dropped from EACH end per channel (0 to <0.5).
 * @returns {{r:number,g:number,b:number,count:number}|null} null when no usable pixels.
 */
export function averageColor(pixels, rect, { trim = 0.1, minAlpha = 16 } = {}) {
  const x0 = Math.max(0, Math.floor(rect.x)); const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(pixels.width, Math.ceil(rect.x + rect.w)); const y1 = Math.min(pixels.height, Math.ceil(rect.y + rect.h));
  const rs = []; const gs = []; const bs = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * pixels.width + x) * 4;
      if (pixels.data[i + 3] < minAlpha) continue;
      rs.push(pixels.data[i]); gs.push(pixels.data[i + 1]); bs.push(pixels.data[i + 2]);
    }
  }
  const n = rs.length;
  if (n === 0) return null;
  const cut = Math.min(Math.floor(n * Math.min(Math.max(trim, 0), 0.49)), Math.floor((n - 1) / 2));
  const mean = (arr) => {
    arr.sort((p, q) => p - q);
    let s = 0;
    for (let i = cut; i < n - cut; i += 1) s += arr[i];
    return s / (n - 2 * cut);
  };
  return { r: mean(rs), g: mean(gs), b: mean(bs), count: n };
}

/**
 * @typedef {{ id: string, hsv: {h:number,s:number,v:number}, tolerance?: number }} PaletteEntry
 *
 * Match a sample against a palette. confidence (0-1) = base * marginFactor where
 *   base = clamp01(1 - best.distance / best.tolerance)            (falls monotonically with distance)
 *   marginFactor = MARGIN_FLOOR + (1 - MARGIN_FLOOR) * clamp01((second.distance - best.distance) / MARGIN_FULL)
 * so a sample halfway between two entries gets at most MARGIN_FLOOR * base. A single-entry palette has margin factor 1.
 * @param {{h:number,s:number,v:number}} sampleHsv
 * @param {PaletteEntry[]} palette
 */
export function nearestPalette(sampleHsv, palette) {
  const ranked = (palette || [])
    .map((e) => ({ id: e.id, distance: hsvDistance(sampleHsv, e.hsv), tolerance: e.tolerance ?? DEFAULT_TOLERANCE }))
    .sort((p, q) => p.distance - q.distance || (p.id < q.id ? -1 : 1));
  if (ranked.length === 0) return { best: null, second: null, distance: Infinity, confidence: 0, alternatives: [] };
  const [best, second] = ranked;
  const base = clamp01(1 - best.distance / best.tolerance);
  const factor = second
    ? MARGIN_FLOOR + (1 - MARGIN_FLOOR) * clamp01((second.distance - best.distance) / MARGIN_FULL)
    : 1;
  return {
    best: best.id,
    second: second ? second.id : null,
    distance: best.distance,
    confidence: clamp01(base * factor),
    alternatives: ranked.slice(1, 4).map((e) => ({ id: e.id, distance: e.distance })),
  };
}
