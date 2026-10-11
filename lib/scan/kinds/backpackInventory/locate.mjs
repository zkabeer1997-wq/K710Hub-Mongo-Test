// Find the item tiles (rounded squares on the Backpack grid) in the image itself, so full screenshots, scrolled
// screenshots and cropped ones all work. No fixed pixel positions: tiles are the squarish blobs that differ from the
// beige panel colour, and their size sets the scale for everything else.
import { resizeToWidth, crop, resizeTo } from '../../normalize.mjs';

/** Canonical tile size every tile is resampled to before it is read. */
export const TILE = 240;

const WORK_WIDTH = 400;
const MIN_TILE_FRACTION = 0.07; // of the image width
const MAX_TILE_FRACTION = 0.5;
const BG_DISTANCE = 36; // summed |dR|+|dG|+|dB| from the panel colour
const SQUARE_TOLERANCE = 0.22;

/** The most common colours of the image, distinct from each other: the panel behind the tiles is one of them. */
export function panelColours(p, k = 4) {
  const counts = new Map();
  const n = p.width * p.height;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const key = ((p.data[o] >> 3) << 10) | ((p.data[o + 1] >> 3) << 5) | (p.data[o + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out = [];
  for (const [key] of [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 60)) {
    const c = [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4];
    if (out.every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) + Math.abs(o[2] - c[2]) > 48)) out.push(c);
    if (out.length >= k) break;
  }
  return out;
}

function maskOf(p, bg, dist = BG_DISTANCE) {
  const n = p.width * p.height;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    m[i] = Math.abs(p.data[o] - bg[0]) + Math.abs(p.data[o + 1] - bg[1]) + Math.abs(p.data[o + 2] - bg[2]) > dist ? 1 : 0;
  }
  return m;
}

function components(mask, w, h) {
  const label = new Int32Array(w * h);
  const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!mask[s] || label[s]) continue;
    const id = comps.length + 1;
    let x0 = w; let y0 = h; let x1 = 0; let y1 = 0; let area = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w; const y = (i - x) / w;
      area += 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !label[i - w]) { label[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !label[i + w]) { label[i + w] = id; stack.push(i + w); }
    }
    comps.push({ x0, y0, x1, y1, area, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return comps;
}

function frac(mask, w, x0, x1, y0, y1, vertical) {
  // fraction of mask pixels along one column (vertical) or row
  let c = 0; let n = 0;
  if (vertical) { for (let y = y0; y <= y1; y += 1) { c += mask[y * w + x0]; n += 1; } } else { for (let x = x0; x <= x1; x += 1) { c += mask[y0 * w + x]; n += 1; } }
  return n ? c / n : 0;
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels
 * @returns {{ tiles: {x:number,y:number,size:number,col:number,row:number,cx:number,cy:number}[], size: number, background: number[], scale: number }}
 * Rects are in the coordinates of `pixels`.
 */
export function locateTiles(pixels) {
  const empty = { tiles: [], size: 0, background: [0, 0, 0], scale: 1 };
  if (!pixels || pixels.width < 120 || pixels.height < 120) return empty;
  const small = pixels.width > WORK_WIDTH ? resizeToWidth(pixels, WORK_WIDTH) : pixels;
  const k = pixels.width / small.width;
  const minS = small.width * MIN_TILE_FRACTION;
  const maxS = small.width * MAX_TILE_FRACTION;
  let found = null;
  for (const colour of panelColours(small)) {
    const mask = maskOf(small, colour);
    const comps = components(mask, small.width, small.height);
    const cand = comps.filter((c) => c.w >= minS && c.w <= maxS && c.h >= minS * 0.9 && c.h <= maxS * 1.2 && c.area > 0.55 * c.w * c.h
      && c.h / c.w > 1 - SQUARE_TOLERANCE && c.h / c.w < 1 + SQUARE_TOLERANCE + 0.1);
    if (cand.length === 0) continue;
    // the tile size is the width that most candidates agree on
    let bestW = 0; let bestN = 0;
    for (const c of cand) {
      const n = cand.filter((d) => Math.abs(d.w - c.w) <= 0.1 * c.w).length;
      if (n > bestN) { bestN = n; bestW = c.w; }
    }
    const sized = cand.filter((c) => Math.abs(c.w - bestW) <= 0.12 * bestW);
    if (!found || sized.length > found.sized.length) found = { sized, bg: colour, bestW };
  }
  if (!found) return empty;
  const { sized, bg } = found;
  const wSmall = sized.map((c) => c.w).sort((a, b) => a - b)[Math.floor(sized.length / 2)];
  // refine each rect on the full-size image
  const full = maskOf(pixels, bg);
  const W = pixels.width; const H = pixels.height;
  const margin = Math.ceil(k * 3) + 2;
  const rects = [];
  for (const c of sized) {
    let x0 = Math.max(0, Math.round(c.x0 * k) - margin); let x1 = Math.min(W - 1, Math.round((c.x1 + 1) * k) + margin);
    let y0 = Math.max(0, Math.round(c.y0 * k) - margin); const y1 = Math.min(H - 1, Math.round((c.y1 + 1) * k) + margin);
    const midY0 = Math.round(c.y0 * k + (c.h * k) * 0.25); const midY1 = Math.round(c.y0 * k + (c.h * k) * 0.7);
    const midX0 = Math.round(c.x0 * k + (c.w * k) * 0.25); const midX1 = Math.round(c.x0 * k + (c.w * k) * 0.75);
    let left = x0; while (left < x1 && frac(full, W, left, left, midY0, midY1, true) < 0.6) left += 1;
    let right = x1; while (right > left && frac(full, W, right, right, midY0, midY1, true) < 0.6) right -= 1;
    let top = y0; while (top < y1 && frac(full, W, midX0, midX1, top, top, false) < 0.6) top += 1;
    x0 = left; x1 = right;
    rects.push({ x: x0, y: top, w: x1 - x0 + 1 });
  }
  const size = Math.round(rects.map((r) => r.w).sort((a, b) => a - b)[Math.floor(rects.length / 2)] || wSmall * k);
  // grid positions
  const xs = [...new Set(rects.map((r) => r.x))].sort((a, b) => a - b);
  const colCentres = []; for (const x of xs) { if (!colCentres.length || x - colCentres[colCentres.length - 1] > size * 0.5) colCentres.push(x); }
  const ys = [...new Set(rects.map((r) => r.y))].sort((a, b) => a - b);
  const rowCentres = []; for (const y of ys) { if (!rowCentres.length || y - rowCentres[rowCentres.length - 1] > size * 0.5) rowCentres.push(y); }
  const nearest = (arr, v) => arr.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(arr[bi] - v) ? i : bi), 0);
  const tiles = rects.map((r) => ({
    x: r.x, y: r.y, size, col: nearest(colCentres, r.x), row: nearest(rowCentres, r.y), cx: r.x + size / 2, cy: r.y + size / 2,
  })).sort((a, b) => a.row - b.row || a.col - b.col);
  return { tiles, size, background: bg, scale: size / TILE };
}

/** Cut one tile and resample it to TILE x TILE. */
export function cutTile(pixels, tile) {
  const r = crop(pixels, { x: tile.x, y: tile.y, w: tile.size, h: tile.size });
  return resizeTo(r, TILE, TILE);
}
