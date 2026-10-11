// Quantity digit reader for Backpack tiles. The game draws the quantity bottom-right as cream-white bold digits with a
// dark outline. Digits are cut apart by column, each glyph is matched against digit templates cut from real screenshots
// (nearest exemplar), and a comma is recognised by the wider gap it leaves. Each digit gets its own confidence.
// Pure ES module, works on canonical TILE x TILE tiles (see locate.mjs).

export const DIGIT_BOX = { x0: 50, x1: 238, y0: 180, y1: 211 };
/** Glyph grid the templates live on. Digits are cut to the same height in the game, so rows are not stretched. */
export const GLYPH_W = 28;
export const GLYPH_H = 34;
// Gaps between neighbouring digits (canonical px): ordinary 1-9, with a comma 10-19 (measured on the two fixtures).
const COMMA_MIN_GAP = 8;
const COMMA_MAX_GAP = 12;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Soft "cream-white digit fill" value 0-1 for a pixel. */
export function digitFill(r, g, b) {
  const mn = Math.min(r, g, b);
  if (b - r > 22) return 0; // light-blue speedup arrows are not digits
  return clamp01((mn - 185) / 35);
}

const OUTLINE_SUM = 375; // r+g+b below this is the dark outline around each digit

/** @returns {{ w:number, h:number, soft:Float32Array }} the soft digit map of the digit box (fill that has a dark outline within 4 px) */
export function digitMap(tile) {
  const { x0, x1, y0, y1 } = DIGIT_BOX;
  const w = x1 - x0; const h = y1 - y0;
  const R = 4;
  const ew = w + 2 * R; const eh = h + 2 * R;
  const dark = new Uint8Array(ew * eh);
  for (let y = 0; y < eh; y += 1) {
    for (let x = 0; x < ew; x += 1) {
      const sx = Math.min(tile.width - 1, Math.max(0, x + x0 - R)); const sy = Math.min(tile.height - 1, Math.max(0, y + y0 - R));
      const i = (sy * tile.width + sx) * 4;
      dark[y * ew + x] = tile.data[i] + tile.data[i + 1] + tile.data[i + 2] < OUTLINE_SUM ? 1 : 0;
    }
  }
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y + y0) * tile.width + x + x0) * 4;
      const v = digitFill(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
      if (v === 0) continue;
      let near = false;
      for (let dy = 0; dy <= 2 * R && !near; dy += 1) for (let dx = 0; dx <= 2 * R; dx += 1) if (dark[(y + dy) * ew + x + dx]) { near = true; break; }
      if (near) soft[y * w + x] = v;
    }
  }
  return { w, h, soft };
}

function glyphGrid(map, a, b) {
  // centre the glyph columns [a, b] on a GLYPH_W wide grid; rows are absolute (digits share one baseline)
  const out = new Float32Array(GLYPH_W * GLYPH_H);
  const cx = (a + b) / 2;
  const ox = Math.round(cx - GLYPH_W / 2);
  for (let y = 0; y < GLYPH_H && y < map.h; y += 1) {
    for (let x = 0; x < GLYPH_W; x += 1) {
      const sx = x + ox;
      if (sx < a || sx > b || sx < 0 || sx >= map.w) continue;
      out[y * GLYPH_W + x] = map.soft[y * map.w + sx];
    }
  }
  return out;
}

/** Column runs of the digit map: [{ a, b, top, bottom, ink }]. Touching digits are split by `splitWide`. */
export function glyphRuns(map) {
  const cols = new Float32Array(map.w);
  for (let x = 0; x < map.w; x += 1) { let c = 0; for (let y = 0; y < map.h; y += 1) c += map.soft[y * map.w + x] >= 0.5 ? 1 : 0; cols[x] = c; }
  const runs = [];
  let s = -1;
  for (let x = 0; x <= map.w; x += 1) {
    const on = x < map.w && cols[x] > 0;
    if (on && s < 0) s = x;
    if (!on && s >= 0) {
      let top = map.h; let bottom = -1; let ink = 0;
      for (let xx = s; xx < x; xx += 1) for (let y = 0; y < map.h; y += 1) if (map.soft[y * map.w + xx] >= 0.5) { if (y < top) top = y; if (y > bottom) bottom = y; ink += 1; }
      runs.push({ a: s, b: x - 1, top, bottom, ink });
      s = -1;
    }
  }
  return runs;
}

/** Keep digit-sized runs: tall enough, not a sliver, not a wide frame/icon streak. */
export function digitRuns(map) {
  const raw = glyphRuns(map);
  const out = [];
  for (const r of raw) {
    const height = r.bottom - r.top + 1;
    const width = r.b - r.a + 1;
    if (height < 20 || width < 5 || r.ink < 40) continue;
    if (width > 31) {
      // two touching digits: cut at the thinnest column near the middle
      const n = Math.round(width / 21);
      const parts = Math.max(2, n);
      let prev = r.a;
      for (let k = 1; k < parts; k += 1) {
        const target = r.a + Math.round((width * k) / parts);
        let best = target; let bestInk = Infinity;
        for (let x = target - 4; x <= target + 4; x += 1) {
          let c = 0; for (let y = 0; y < map.h; y += 1) c += map.soft[y * map.w + x] >= 0.5 ? 1 : 0;
          if (c < bestInk) { bestInk = c; best = x; }
        }
        out.push({ ...r, a: prev, b: best - 1, split: true });
        prev = best;
      }
      out.push({ ...r, a: prev, b: r.b, split: true });
    } else out.push(r);
  }
  return out;
}

/** Template distance in 0-1 (0 = identical): total absolute difference over the larger of the two inks, with a +-2 px shift. */
export function glyphDistance(a, b, shift = 2) {
  let best = Infinity;
  for (let dy = -shift; dy <= shift; dy += 1) {
    for (let dx = -shift; dx <= shift; dx += 1) {
      let diff = 0; let mass = 0;
      for (let y = 0; y < GLYPH_H; y += 1) {
        const sy = y + dy;
        for (let x = 0; x < GLYPH_W; x += 1) {
          const sx = x + dx;
          const av = a[y * GLYPH_W + x];
          const bv = sy >= 0 && sy < GLYPH_H && sx >= 0 && sx < GLYPH_W ? b[sy * GLYPH_W + sx] : 0;
          diff += Math.abs(av - bv); mass += Math.max(av, bv);
        }
      }
      const d = mass > 0 ? diff / mass : 1;
      if (d < best) best = d;
    }
  }
  return best;
}

/** Digit templates: { digit: '0'-'9', grid: Float32Array }[] (several exemplars per digit). */
export function decodeDigitTemplates(json) {
  return (json?.digits || []).map((t) => {
    return { digit: t.digit, source: t.source, grid: b64ToGrid(t.b64) };
  });
}

export function b64ToGrid(b64) {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i) / 255;
  return out;
}

export function encodeGrid(grid) {
  let bin = '';
  for (const v of grid) bin += String.fromCharCode(Math.round(v * 255));
  return btoa(bin);
}

/** Confidence of one digit from the nearest distance and the gap to the best other digit. */
export function digitConfidence(best, second) {
  const closeness = clamp01(1 - (best - 0.18) / 0.3); // 0.18 or better is a clean match, 0.48 is hopeless
  const margin = clamp01((second - best) / 0.12);
  return Math.round(Math.min(closeness, 0.35 + 0.65 * margin) * 1000) / 1000;
}

/** Match one glyph grid against the templates. */
export function classifyGlyph(grid, templates) {
  const bestBy = new Map();
  for (const t of templates) {
    const d = glyphDistance(grid, t.grid);
    if (!bestBy.has(t.digit) || d < bestBy.get(t.digit)) bestBy.set(t.digit, d);
  }
  const ranked = [...bestBy.entries()].sort((x, y) => x[1] - y[1]);
  if (!ranked.length) return { digit: null, confidence: 0, distance: 1, alternatives: [] };
  const [digit, best] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : 1;
  return {
    digit, distance: best, confidence: digitConfidence(best, second),
    alternatives: ranked.slice(1, 3).map(([d, dist]) => ({ digit: d, distance: dist })),
  };
}

/** Thinnest column of a run, searched away from its ends (where two touching digits are joined). */
function thinnestColumn(map, a, b) {
  let best = -1; let bestInk = Infinity;
  for (let x = a + 6; x <= b - 6; x += 1) {
    let c = 0; for (let y = 0; y < map.h; y += 1) c += map.soft[y * map.w + x] >= 0.5 ? 1 : 0;
    if (c < bestInk) { bestInk = c; best = x; }
  }
  return best;
}

/**
 * Glyphs of the tile's digits, each already classified. A run that could be one wide digit or two touching narrow ones
 * (typically "11") is tried both ways and the better match wins.
 */
export function readGlyphs(tile, templates) {
  const map = digitMap(tile);
  const runs = digitRuns(map);
  const out = [];
  for (const r of runs) {
    const gapBefore = out.length ? r.a - out[out.length - 1].b - 1 : null;
    const grid = glyphGrid(map, r.a, r.b);
    const single = classifyGlyph(grid, templates);
    const width = r.b - r.a + 1;
    let chosen = null;
    if (width >= 19 && width <= 31 && templates.length) {
      const cut = thinnestColumn(map, r.a, r.b);
      if (cut > 0) {
        const left = classifyGlyph(glyphGrid(map, r.a, cut - 1), templates);
        const right = classifyGlyph(glyphGrid(map, cut, r.b), templates);
        const splitDistance = (left.distance + right.distance) / 2;
        if (splitDistance + 0.04 < single.distance) {
          chosen = [{ a: r.a, b: cut - 1, gapBefore, cls: left, split: true }, { a: cut, b: r.b, gapBefore: 1, cls: right, split: true }];
        }
      }
    }
    if (chosen) out.push(...chosen); else out.push({ a: r.a, b: r.b, gapBefore, cls: single });
  }
  return out;
}

/** Raw glyph grids (for harvesting templates): one per digit run, no splitting. */
export function tileGlyphs(tile) {
  const map = digitMap(tile);
  const runs = digitRuns(map);
  return runs.map((r, i) => {
    const prev = runs[i - 1];
    return { run: r, gapBefore: prev ? r.a - prev.b - 1 : null, grid: glyphGrid(map, r.a, r.b) };
  });
}

/**
 * Read the quantity on a canonical tile.
 * @returns {{ value:number|null, text:string, confidence:number, digits:{digit:string,confidence:number,distance:number}[], flags:string[] }}
 */
export function readQuantity(tile, templates) {
  const glyphs = readGlyphs(tile, templates);
  const flags = [];
  if (glyphs.length === 0) return { value: null, text: '', confidence: 0, digits: [], flags: ['no_digits'] };
  const digits = glyphs.map((g) => g.cls);
  const text = digits.map((d) => d.digit ?? '?').join('');
  // The game groups thousands with commas. A comma leaves a wide gap: it must sit exactly where grouping puts it.
  const n = glyphs.length;
  let consistent = n <= 9;
  for (let i = 1; i < n; i += 1) {
    const wantComma = (n - i) % 3 === 0;
    const gap = glyphs[i].gapBefore;
    if (wantComma ? gap < COMMA_MIN_GAP : gap > COMMA_MAX_GAP) consistent = false;
  }
  if (!consistent) flags.push('comma_mismatch');
  const value = text.includes('?') ? null : Number(text);
  let confidence = Math.min(...digits.map((d) => d.confidence));
  if (!consistent) confidence = Math.min(confidence, 0.5);
  return {
    value: Number.isFinite(value) ? value : null,
    text: n > 3 ? text.replace(/\B(?=(\d{3})+$)/g, ',') : text,
    confidence,
    digits: digits.map((d) => ({ digit: d.digit, confidence: d.confidence, distance: Math.round(d.distance * 1000) / 1000 })),
    flags,
  };
}
