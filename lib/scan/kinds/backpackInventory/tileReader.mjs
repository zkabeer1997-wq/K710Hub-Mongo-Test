// Reads one canonical (240 x 240) Backpack tile:
//   speedup?      the big light-blue double chevron in the middle
//   denomination  the white label at the top ("1 min(s)", "5 min(s)", "1 hr(s)"), matched against label templates
//   category      the small icon bottom-left (none / hammer / helmet / book / green plus), matched on edge maps so the
//                 frame colour does not matter
//   resource      TG / TTG / TG Dust by icon colour map
//   quantity      digits (digits.mjs)
// Frame colour (grey / green / blue) is only a cross-check of the denomination.
import { readQuantity, b64ToGrid } from './digits.mjs';
import { RESOURCE_IDS } from './gameData.mjs';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---- label (denomination) -------------------------------------------------
export const LABEL_BOX = { x0: 30, x1: 210, y0: 6, y1: 54 };
const LW = LABEL_BOX.x1 - LABEL_BOX.x0;
const LH = LABEL_BOX.y1 - LABEL_BOX.y0;

export function labelMap(tile) {
  const m = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y += 1) {
    for (let x = 0; x < LW; x += 1) {
      const i = ((y + LABEL_BOX.y0) * tile.width + x + LABEL_BOX.x0) * 4;
      m[y * LW + x] = clamp01((Math.min(tile.data[i], tile.data[i + 1], tile.data[i + 2]) - 185) / 35);
    }
  }
  return m;
}

export function labelDistance(a, b, sx = 6, sy = 3) {
  let best = 9;
  for (let dy = -sy; dy <= sy; dy += 1) {
    for (let dx = -sx; dx <= sx; dx += 1) {
      let diff = 0; let mass = 0;
      for (let y = 0; y < LH; y += 1) {
        const yy = y + dy;
        for (let x = 0; x < LW; x += 1) {
          const xx = x + dx;
          const av = a[y * LW + x];
          const bv = yy >= 0 && yy < LH && xx >= 0 && xx < LW ? b[yy * LW + xx] : 0;
          diff += Math.abs(av - bv); mass += Math.max(av, bv);
        }
      }
      const d = mass > 0 ? diff / mass : 1;
      if (d < best) best = d;
    }
  }
  return best;
}

// ---- category (bottom-left icon) ------------------------------------------
export const CATEGORY_BOX = { x0: 2, y0: 122, n: 14, cell: 8 };

const lum = (t, x, y) => {
  const i = (y * t.width + x) * 4;
  return 0.299 * t.data[i] + 0.587 * t.data[i + 1] + 0.114 * t.data[i + 2];
};

export function categoryFeature(tile) {
  const { x0, y0, n, cell } = CATEGORY_BOX;
  const f = [];
  for (let cy = 0; cy < n; cy += 1) {
    for (let cx = 0; cx < n; cx += 1) {
      let s = 0;
      for (let y = y0 + cy * cell; y < y0 + (cy + 1) * cell; y += 1) {
        for (let x = x0 + cx * cell; x < x0 + (cx + 1) * cell; x += 1) {
          s += Math.hypot(lum(tile, x + 1, y) - lum(tile, x - 1, y), lum(tile, x, y + 1) - lum(tile, x, y - 1));
        }
      }
      f.push(s / (cell * cell));
    }
  }
  const m = Math.sqrt(f.reduce((a, v) => a + v * v, 0)) || 1;
  return f.map((v) => v / m);
}

const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]); return s; };

// ---- resource icon ---------------------------------------------------------
export const ICON_BOX = { x0: 30, y0: 40, w: 180, h: 130, n: 24 };

export function iconFeature(tile) {
  const { x0, y0, w, h, n } = ICON_BOX;
  const f = [];
  for (let cy = 0; cy < n; cy += 1) {
    for (let cx = 0; cx < n; cx += 1) {
      let r = 0; let g = 0; let b = 0; let c = 0;
      for (let y = y0 + Math.floor((cy * h) / n); y < y0 + Math.floor(((cy + 1) * h) / n); y += 1) {
        for (let x = x0 + Math.floor((cx * w) / n); x < x0 + Math.floor(((cx + 1) * w) / n); x += 1) {
          const i = (y * tile.width + x) * 4; r += tile.data[i]; g += tile.data[i + 1]; b += tile.data[i + 2]; c += 1;
        }
      }
      f.push(r / c, g / c, b / c);
    }
  }
  return f;
}
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]); return s / a.length; };

// ---- speedup detection and frame colour -----------------------------------
/** Share of the middle of the tile that is the light-blue speedup chevron (0.19-0.22 on speedups, 0.00-0.01 on resources). */
export function chevronShare(tile) {
  let c = 0; let n = 0;
  for (let y = 40; y < 190; y += 1) {
    for (let x = 30; x < 210; x += 1) {
      const i = (y * tile.width + x) * 4;
      const r = tile.data[i]; const g = tile.data[i + 1]; const b = tile.data[i + 2];
      n += 1;
      if (b >= 215 && g >= 190 && b - r >= 28 && b - r < 110 && r > 130) c += 1;
    }
  }
  return c / n;
}
export const CHEVRON_MIN = 0.1;

/** Frame colour name at the left edge: grey, green, blue, or other. */
export function frameName(tile) {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let y = 100; y < 140; y += 1) for (let x = 4; x < 9; x += 1) { const i = (y * tile.width + x) * 4; r += tile.data[i]; g += tile.data[i + 1]; b += tile.data[i + 2]; n += 1; }
  r /= n; g /= n; b /= n;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const s = mx ? (mx - mn) / mx : 0;
  if (s < 0.12) return 'grey';
  if (b === mx && b - r > 60) return 'blue';
  if (g === mx && g - r > 60) return 'green';
  return 'other';
}

// ---- templates -------------------------------------------------------------
/** Decode templates.json (built by scripts/build-backpack-templates.mjs). */
export function decodeTemplates(json) {
  return {
    version: json.version,
    digits: (json.digits || []).map((t) => ({ digit: t.digit, source: t.source, grid: b64ToGrid(t.b64) })),
    labels: (json.labels || []).map((t) => ({ denomination: t.denomination, source: t.source, map: b64ToGrid(t.b64) })),
    categories: (json.categories || []).map((t) => ({ category: t.category, source: t.source, feature: t.feature })),
    resources: (json.resources || []).map((t) => ({ item: t.item, source: t.source, feature: t.feature })),
  };
}

// ---- reading ---------------------------------------------------------------
/** Denomination from the label: nearest template, confidence from distance and the gap to the best other denomination. */
export function readDenomination(tile, templates) {
  const map = labelMap(tile);
  const best = new Map();
  for (const t of templates.labels) {
    const d = labelDistance(map, t.map);
    if (!best.has(t.denomination) || d < best.get(t.denomination)) best.set(t.denomination, d);
  }
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
  if (!ranked.length) return { value: null, confidence: 0, flags: ['no_templates'] };
  const [id, d] = ranked[0];
  const other = ranked[1] ? ranked[1][1] : 1;
  const confidence = Math.min(clamp01(1 - (d - 0.2) / 0.2), clamp01((other - d) / 0.1));
  return { value: id, confidence: r3(confidence), distance: r3(d), flags: [], alternatives: ranked.slice(1).map(([v, dist]) => ({ value: v, distance: r3(dist) })) };
}

export function readCategory(tile, templates) {
  const f = categoryFeature(tile);
  const best = new Map();
  for (const t of templates.categories) {
    const d = l1(f, t.feature);
    if (!best.has(t.category) || d < best.get(t.category)) best.set(t.category, d);
  }
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
  if (!ranked.length) return { value: null, confidence: 0, flags: ['no_templates'] };
  const [id, d] = ranked[0];
  const other = ranked[1] ? ranked[1][1] : 9;
  const confidence = Math.min(clamp01(1 - (d - 2.5) / 2), clamp01((other - d) / 2));
  return { value: id, confidence: r3(confidence), distance: r3(d), flags: [], alternatives: ranked.slice(1, 3).map(([v, dist]) => ({ value: v, distance: r3(dist) })) };
}

/** Which of TG / TTG / TG Dust this tile is, or null when it is some other item. */
export function readResourceItem(tile, templates) {
  const f = iconFeature(tile);
  const ranked = templates.resources.map((t) => ({ item: t.item, d: mad(f, t.feature) })).sort((a, b) => a.d - b.d);
  if (!ranked.length) return { item: null, confidence: 0, distance: 99 };
  const [first, second] = ranked;
  const closeness = clamp01(1 - (first.d - 10) / 22);
  const margin = clamp01((second.d - first.d) / 18);
  const isItem = first.d <= RESOURCE_MATCH_MAX;
  return { item: isItem ? first.item : null, confidence: isItem ? r3(Math.min(closeness, margin)) : 0, distance: r3(first.d), second: r3(second.d) };
}
/** Mean colour difference (0-255 scale) above which a tile is "some other item". Own icons stay under ~8, other items over 53. */
export const RESOURCE_MATCH_MAX = 30;

export function classifyTile(tile, templates) {
  const share = chevronShare(tile);
  if (share >= CHEVRON_MIN) return { type: 'speedup', chevron: r3(share) };
  const res = readResourceItem(tile, templates);
  return res.item ? { type: 'resource', ...res } : { type: 'other', ...res };
}

export function readTileQuantity(tile, templates) {
  return readQuantity(tile, templates.digits);
}

export { RESOURCE_IDS };
