#!/usr/bin/env node
// Import the Governor Gear art for PENDANT, PANTS and BATON from the owner's in-game "Gear Guide" screenshots.
//
// Origin:  21 raw iPhone screenshots (1284x2778) of the Gear Guide modal, e.g. ~/Downloads/Kingshot Governor Gear Pendant Pants and Baton/
//          IMG_8397.PNG, IMG_8398.PNG, IMG_8400.PNG ... (sorted by name). Each shows TWO groups; a group is a header bar
//          ('Uncommon', 'Rare (1-Star)', 'Mythic T1 (2-Star)', ...) above a 3x2 grid of the six piece tiles:
//            row 1 = hat, PENDANT, shirt      row 2 = PANTS, ring, BATON
//          Files in name order hold the 42 states Green 0-1, Blue 0-3, Purple 0-3, Purple T1 0-3, Gold T0..T3 0-3, Red T0..T2 0-3.
// Purpose: shown on the loadout board for the three pieces the earlier owner art did not cover. Same 3 troop-folder scheme:
//          governor-gear/cavalry-2 = pendant, infantry-2 = pants, archer-2 = baton (cavalry, infantry, archer stay hat, shirt, ring).
// Method:  tile squares are found per screenshot by connected components of "not panel beige / not header tan" pixels (the dark rim
//          around every tile makes each tile one component), filtered to ~220px squares; rows are paired into groups of six by y.
//          The frame colour of each group is classified and compared with the quality the file order says it should be; any
//          disagreement, missing tile or odd count fails loudly (exit 2). `--check` only reports and writes check images.
// Dimming:  the Gear Guide draws every tile except the player's current one at about half brightness, desaturated. The crops get a
//          fixed brightness/saturation lift (UNDIM_V / UNDIM_S, tuned by eye against the owner's bright hat/shirt/ring art).
// Locks:    tiles the screenshot account has not unlocked carry a white padlock, and the current tile is drawn highlighted. Neither is
//          usable as is. Where a clean tile of the SAME art exists (Red T0 s0 for pants and baton: Red T0..T2 share one design) the
//          tile is rebuilt from real pixels: clean base + the label corner and star strip copied from the locked tile (the padlock is
//          verified to sit right of that strip). Where no clean base exists (pendant Gold T3 and all Red) nothing is written.
// Background: flood fill from the crop border over the panel beige (tolerance), then a 2px feather that un-mixes the beige from the
//          rim pixels, so the rounded corners are transparent without halos. Everything inside the frame is kept.
// Red T3..T6: the Gear Guide screenshots stop at Red T2, so those 16 states per piece come from the owner's 384px files
//          (<red dir>/{Cavalry2 (Pendant),Infantry2 (Pants),Archer2 (Baton)}/Red T<tier><stars>.jpg) through the SAME background
//          removal as scripts/import-loadout-images.mjs (near-white flood fill from the border + 2px feather), webp at 384px, source 'owner-art'.
//          Mixed resolution on purpose: 226px crops (Gear Guide) and 384px files; the board scales both with CSS, nothing is upscaled.
// Pendant:  Gold T3 and Red T0..T2 are only visible locked/highlighted in the screenshots and have no clean sibling: no file is written.
// Usage:   node scripts/import-gear-guide-screens.mjs [sourceDir] [--check] [--scratch <dir>] [--red <dir>]   (idempotent, deterministic)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GOVERNOR_GEAR_STATES } from '../lib/scan/kinds/governorProfile/gameData.mjs';
import { GEAR_GUIDE_PIECES, gearImageKey } from '../lib/loadoutImages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images/loadout');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const scratchAt = args.indexOf('--scratch');
const SCRATCH = scratchAt >= 0 ? path.resolve(args[scratchAt + 1]) : null;
const SRC = path.resolve((args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--scratch' && args[i - 1] !== '--red') || '~/Downloads/Kingshot Governor Gear Pendant Pants and Baton').replace(/^~/, os.homedir()));
const RED_DIR = path.resolve((args[args.indexOf('--red') + 1] && args.includes('--red') ? args[args.indexOf('--red') + 1] : '~/Downloads/Red_T3_to_T6').replace(/^~/, os.homedir()));
const RED_FOLDERS = { pendant: 'Cavalry2 (Pendant)', pants: 'Infantry2 (Pants)', baton: 'Archer2 (Baton)' };
const QUALITY = Number(process.env.LOADOUT_WEBP_QUALITY || 85);

const PANEL = [221, 213, 199]; // beige inside the groups
const HEADER = [197, 174, 140]; // tan header bar
const UNDIM_V = 1.85; const UNDIM_S = 1.4;
const NEW_PIECES = ['pendant', 'pants', 'baton']; // saved
const GRID = [['hat', 'pendant', 'shirt'], ['pants', 'ring', 'baton']];
const FRAME_NAMES = ['green', 'blue', 'purple', 'gold', 'red'];

const EXPECTED = GOVERNOR_GEAR_STATES.filter((s) => !(s.quality === 'red' && s.tier >= 3)); // 42, owner file order

const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Tile bounding boxes in one screenshot: [{x,y,w,h}] sorted by row then column. */
function findTiles(rgb, W, H) {
  const k = W / 1284;
  const x0 = Math.round(150 * k); const x1 = Math.round(1134 * k);
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      const p = [rgb[i], rgb[i + 1], rgb[i + 2]];
      if (dist(p, PANEL) > 60 && dist(p, HEADER) > 60) mask[y * W + x] = 1;
    }
  }
  const seen = new Uint8Array(W * H);
  const found = [];
  const stack = [];
  const min = 190 * k; const max = 245 * k;
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    let minX = W; let maxX = 0; let minY = H; let maxY = 0; let count = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      const x = i % W; const y = (i - x) / W;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    const w = maxX - minX + 1; const h = maxY - minY + 1;
    if (w >= min && w <= max && h >= min && h <= max && count > 0.6 * w * h) found.push({ x: minX, y: minY, w, h });
  }
  found.sort((a, b) => a.y - b.y || a.x - b.x);
  return found;
}

/** Pair tiles into groups of 6 (two rows of three). Returns [{tiles:{piece:box}, headerY}] or problems. */
function groupTiles(tiles, problems, name) {
  const rows = [];
  for (const t of tiles) {
    const row = rows.find((r) => Math.abs(r[0].y - t.y) < 20);
    if (row) row.push(t); else rows.push([t]);
  }
  rows.forEach((r) => r.sort((a, b) => a.x - b.x));
  if (rows.length !== 4 || rows.some((r) => r.length !== 3)) {
    problems.push(`${name}: expected 4 rows of 3 tiles, found rows [${rows.map((r) => r.length).join(',')}]`);
    return [];
  }
  const groups = [];
  for (let g = 0; g < 2; g++) {
    const tilesByPiece = {};
    GRID.forEach((names, r) => rows[g * 2 + r].forEach((box, c) => { tilesByPiece[names[c]] = box; }));
    groups.push({ tiles: tilesByPiece });
  }
  return groups;
}

/** Median colour of a thin strip on the right-hand side of a tile (no label, no stars there). */
function frameColour(rgb, W, box) {
  const xs = []; const ys = [];
  const cx0 = Math.round(box.x + box.w * 0.86); const cx1 = Math.round(box.x + box.w * 0.92);
  const cy0 = Math.round(box.y + box.h * 0.12); const cy1 = Math.round(box.y + box.h * 0.88);
  const rs = []; const gs = []; const bs = [];
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) { const i = (y * W + x) * 3; rs.push(rgb[i]); gs.push(rgb[i + 1]); bs.push(rgb[i + 2]); xs.push(x); ys.push(y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/** Colour name from an RGB frame fill (hue based; thresholds fitted on the guide's tile fills). */
function classifyFrame([r, g, b]) {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  if (mx - mn < 18) return 'grey';
  let h;
  const d = mx - mn;
  if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60;
  if (h >= 80 && h < 170) return 'green';
  if (h >= 190 && h < 240) return 'blue';
  if (h >= 240 && h < 330) return 'purple';
  if (h >= 20 && h < 70) return 'gold';
  if (h >= 330 || h < 20) return 'red';
  return `hue${Math.round(h)}`;
}

/** RGB crop -> RGBA with the border-connected panel beige removed and a feathered edge. */
export function removePanel(rgb, w, h) {
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = [];
  const isPanel = (i) => dist([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]], PANEL) <= 36;
  const push = (i) => { if (!bg[i] && isPanel(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(); const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  const RIM = [88, 83, 77]; // the tile's grey rim, the colour the panel blends into at the rounded edge
  const span = dist(RIM, PANEL);
  const out = Buffer.alloc(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let a = bg[i] ? 0 : 255;
      let r = rgb[i * 3]; let g = rgb[i * 3 + 1]; let b = rgb[i * 3 + 2];
      if (!bg[i]) {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[yy * w + xx]) { near = true; break; }
        }
        if (near) {
          const t = Math.min(1, dist([r, g, b], PANEL) / span); // 0 = pure panel, 1 = full rim
          if (t < 1) {
            a = Math.round(255 * Math.max(0.05, t));
            const k = a / 255;
            r = Math.max(0, Math.min(255, Math.round((r - PANEL[0] * (1 - k)) / k)));
            g = Math.max(0, Math.min(255, Math.round((g - PANEL[1] * (1 - k)) / k)));
            b = Math.max(0, Math.min(255, Math.round((b - PANEL[2] * (1 - k)) / k)));
          }
        }
      }
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
    }
  }
  return out;
}


// Same algorithm as scripts/import-loadout-images.mjs (copied: that script runs on import).
/** RGB buffer -> RGBA buffer with the border-connected light background made transparent and a soft edge. */
function removeWhite(rgb, w, h) {
  const n = w * h;
  const minc = new Uint8Array(n);
  for (let i = 0; i < n; i++) minc[i] = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (i) => { if (!bg[i] && minc[i] >= 232) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  // distance (chebyshev, up to 2) from the background region for pixels that are not background
  const near = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) continue;
      let d = 3;
      for (let dy = -2; dy <= 2 && d > 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx; const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !bg[yy * w + xx]) continue;
          d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
        }
      }
      near[i] = d;
    }
  }
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let a = bg[i] ? 0 : 255;
    let r = rgb[i * 3]; let g = rgb[i * 3 + 1]; let b = rgb[i * 3 + 2];
    if (!bg[i] && near[i] <= 2) {
      // feather: lighter pixels at the rim are partly white; remove the white contribution
      a = Math.max(0, Math.min(255, Math.round(((250 - minc[i]) / 60) * 255 + (near[i] === 2 ? 40 : 0))));
      a = Math.max(a, near[i] === 2 ? 128 : 0);
      if (a > 0 && a < 255) {
        const k = a / 255;
        r = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - k)) / k)));
        g = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - k)) / k)));
        b = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - k)) / k)));
      }
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return out;
}


/** Brightness/saturation lift on RGBA (alpha untouched) undoing the guide's dimming. */
export function undim(buf, gv = UNDIM_V, gs = UNDIM_S) {
  const out = Buffer.from(buf);
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i] / 255; const g = buf[i + 1] / 255; const b = buf[i + 2] / 255;
    const mx = Math.max(r, g, b); const d = mx - Math.min(r, g, b);
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; }
    const v = Math.min(1, mx * gv); const s = Math.min(1, (mx ? d / mx : 0) * gs);
    const c = v * s; const x = c * (1 - Math.abs((h % 2) - 1)); const m = v - c;
    const [rr, gg, bb] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6];
    out[i] = Math.round((rr + m) * 255); out[i + 1] = Math.round((gg + m) * 255); out[i + 2] = Math.round((bb + m) * 255);
  }
  return out;
}

/** Pure-white (padlock) pixels of an RGB crop: { count, minX, maxX } in 0..1 of the crop width. */
function padlock(rgb, side) {
  let count = 0; let minX = side; let maxX = 0;
  for (let y = Math.round(side * 0.2); y < side * 0.9; y++) for (let x = Math.round(side * 0.2); x < side * 0.9; x++) {
    const i = (y * side + x) * 3;
    if (rgb[i] >= 245 && rgb[i + 1] >= 245 && rgb[i + 2] >= 245) { count++; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  }
  return { count, minX: minX / side, maxX: maxX / side };
}

const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
/** Tiles of one art: quality plus tier, except Red T0..T2 which share one design (checked by eye on the sheets). */
const artGroup = (s) => (s.quality === 'red' && s.tier <= 2 ? 'red-a' : `${s.quality}-${s.tier}`);

/** Copy a rectangle (fractions of the crop) from src RGB into dst RGB. */
function paste(dst, src, side, x0, y0, x1, y1) {
  for (let y = Math.round(side * y0); y < Math.round(side * y1); y++) {
    const a = (y * side + Math.round(side * x0)) * 3; const b = (y * side + Math.round(side * x1)) * 3;
    src.copy(dst, a, a, b);
  }
}

async function main() {
  if (!fs.existsSync(SRC)) { console.error(`Source folder not found: ${SRC}`); process.exit(1); }
  const files = fs.readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort();
  const problems = [];
  if (files.length !== 21) problems.push(`expected 21 screenshots, found ${files.length}`);
  const recs = []; // { state, file, tiles }
  const decoded = [];
  for (let fi = 0; fi < files.length; fi++) {
    const { data, info } = await sharp(path.join(SRC, files[fi])).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tiles = findTiles(data, info.width, info.height);
    const groups = groupTiles(tiles, problems, files[fi]);
    decoded.push({ file: files[fi], data, W: info.width, H: info.height });
    groups.forEach((g, gi) => {
      const state = EXPECTED[fi * 2 + gi];
      if (!state) { problems.push(`${files[fi]} group ${gi}: no expected state`); return; }
      const frames = Object.fromEntries(Object.entries(g.tiles).map(([p, box]) => [p, classifyFrame(frameColour(data, info.width, box))]));
      const names = new Set(Object.values(frames));
      const ok = names.size === 1 && names.has(state.quality);
      if (!ok) problems.push(`${files[fi]} group ${gi + 1}: expected ${state.quality} (${state.label}) but frame colours are ${JSON.stringify(frames)}`);
      recs.push({ state, file: files[fi], gi, tiles: g.tiles, frame: [...names].join('/') });
      console.log(`${files[fi]} group ${gi + 1}: ${state.label.padEnd(12)} frame=${[...names].join('/').padEnd(7)} ${ok ? 'ok' : 'MISMATCH'}`);
    });
  }
  console.log(`groups detected: ${recs.length} (expected 42)`);
  if (recs.length !== 42) problems.push(`expected 42 groups, found ${recs.length}`);
  if (!recs.length) { console.log(problems.join('\n')); process.exit(2); }

  const byFile = new Map(decoded.map((d) => [d.file, d]));
  // highlighted tiles (the player's current one) are drawn brighter: compare the frame fill with the same piece's median
  const sizes = [];
  const info = new Map(); // `${piece}|${key}` -> { rec, highlighted }
  for (const piece of ['hat', 'pendant', 'shirt', 'pants', 'ring', 'baton']) {
    const lums = recs.map((r) => lum(frameColour(byFile.get(r.file).data, byFile.get(r.file).W, r.tiles[piece])));
    for (const r of recs) {
      const l = lum(frameColour(byFile.get(r.file).data, byFile.get(r.file).W, r.tiles[piece]));
      const same = recs.filter((q) => q.state.quality === r.state.quality && q !== r).map((q) => lums[recs.indexOf(q)]).sort((a, b) => a - b);
      const med = same[same.length >> 1];
      const highlighted = l > med * 1.35;
      info.set(`${piece}|${gearImageKey(r.state)}`, { rec: r, highlighted });
      if (!highlighted) sizes.push(r.tiles[piece].w, r.tiles[piece].h);
    }
  }
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const SIDE = 2 * Math.round(median / 2) + 4; // one exact square for every crop: median tile + 2px margin each side, made even
  console.log(`tile bbox size (non-highlighted): min ${sorted[0]} median ${median} max ${sorted[sorted.length - 1]} -> crop side ${SIDE}px`);
  if (sorted[sorted.length - 1] - sorted[0] > 6) problems.push('tile size spread larger than 6px');

  async function cropTile(rec, piece) {
    const dec = byFile.get(rec.file); const box = rec.tiles[piece];
    const cx = box.x + (box.w - 1) / 2; const cy = box.y + (box.h - 1) / 2;
    const left = Math.round(cx - SIDE / 2 + 0.5); const top = Math.round(cy - SIDE / 2 + 0.5);
    return sharp(dec.data, { raw: { width: dec.W, height: dec.H, channels: 3 } }).extract({ left, top, width: SIDE, height: SIDE }).raw().toBuffer();
  }

  // classify every tile of the three new pieces, build final RGB per state
  const plan = {}; // piece -> key -> { status:'real'|'repaired'|'unavailable', rgb? }
  for (const piece of NEW_PIECES) {
    plan[piece] = {};
    const crops = new Map();
    for (const r of recs) {
      const key = gearImageKey(r.state);
      const rgb = await cropTile(r, piece);
      const lock = padlock(rgb, SIDE);
      const flags = { locked: lock.count > 400, highlighted: info.get(`${piece}|${key}`).highlighted };
      if (flags.locked && lock.minX < 0.36) problems.push(`${piece} ${key}: padlock reaches x=${lock.minX.toFixed(2)}, inside the label/star strip`);
      crops.set(key, { r, rgb, ...flags });
    }
    for (const [key, c] of crops) {
      if (!c.locked && !c.highlighted) { plan[piece][key] = { status: 'real', rgb: c.rgb }; continue; }
      const group = artGroup(c.r.state);
      const base = [...crops.values()].find((o) => !o.locked && !o.highlighted && artGroup(o.r.state) === group && o.r.state.tier === 0 && o.r.state.stars === 0);
      if (!base) { plan[piece][key] = { status: 'unavailable', why: c.locked ? 'padlock' : 'highlighted' }; continue; }
      const rgb = Buffer.from(base.rgb);
      if (c.r.state.tier > 0) {
        const labelSrc = !c.highlighted ? c : [...crops.values()].find((o) => !o.highlighted && artGroup(o.r.state) === group && o.r.state.tier === c.r.state.tier);
        paste(rgb, labelSrc.rgb, SIDE, 0, 0, 0.36, 0.3);
      }
      if (!c.highlighted) paste(rgb, c.rgb, SIDE, 0, 0.3, 0.33, 1);
      plan[piece][key] = { status: 'repaired', rgb, from: base.r.state.label };
    }
    const tally = Object.values(plan[piece]).reduce((t, v) => { t[v.status] = (t[v.status] || 0) + 1; return t; }, {});
    const missing = Object.entries(plan[piece]).filter(([, v]) => v.status === 'unavailable').map(([k]) => k);
    console.log(`${piece}: ${JSON.stringify(tally)}${missing.length ? ` unavailable: ${missing.join(' ')}` : ''}`);
  }

  const finish = (rgb) => undim(removePanel(rgb, SIDE, SIDE));
  const toWebp = (rgba, dest) => sharp(rgba, { raw: { width: SIDE, height: SIDE, channels: 4 } }).webp({ quality: QUALITY, alphaQuality: 90, effort: 6 }).toFile(dest);

  if (SCRATCH) {
    fs.mkdirSync(SCRATCH, { recursive: true });
    const LABEL_H = 22;
    const sheetFor = async (piece, getRgb) => {
      const cells = [];
      for (const r of recs) {
        const key = gearImageKey(r.state);
        const rgb = await getRgb(r, key);
        const png = rgb ? await sharp(finish(rgb), { raw: { width: SIDE, height: SIDE, channels: 4 } }).flatten({ background: '#1a1d26' }).png().toBuffer()
          : await sharp({ create: { width: SIDE, height: SIDE, channels: 3, background: '#333' } }).png().toBuffer();
        if (!['pendant', 'pants', 'baton'].includes(piece) && rgb) {
          fs.mkdirSync(path.join(SCRATCH, 'check', piece), { recursive: true });
          fs.writeFileSync(path.join(SCRATCH, 'check', piece, `${key}.png`), await sharp(finish(rgb), { raw: { width: SIDE, height: SIDE, channels: 4 } }).png().toBuffer());
        }
        const lab = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#1a1d26"/><text x="${SIDE / 2}" y="16" font-size="15" font-family="Helvetica,Arial" fill="#fff" text-anchor="middle">${r.state.label} | ${r.file.slice(4, 8)}${rgb ? '' : ' n/a'}</text></svg>`);
        cells.push(await sharp({ create: { width: SIDE, height: SIDE + LABEL_H, channels: 3, background: '#1a1d26' } }).composite([{ input: png, top: 0, left: 0 }, { input: lab, top: SIDE, left: 0 }]).png().toBuffer());
      }
      const cols = 7; const rows = Math.ceil(cells.length / cols);
      await sharp({ create: { width: cols * SIDE, height: rows * (SIDE + LABEL_H), channels: 3, background: '#1a1d26' } })
        .composite(cells.map((input, i) => ({ input, left: (i % cols) * SIDE, top: Math.floor(i / cols) * (SIDE + LABEL_H) }))).png().toFile(path.join(SCRATCH, `sheet-${piece}.png`));
    };
    for (const piece of NEW_PIECES) await sheetFor(piece, async (r, key) => plan[piece][key].rgb || null);
    for (const piece of ['hat', 'shirt', 'ring']) await sheetFor(piece, (r) => cropTile(r, piece));
    const strips = [];
    for (const r of recs) {
      const d = byFile.get(r.file);
      const top = Math.max(0, r.tiles.hat.y - Math.round(170 * d.W / 1284));
      strips.push(await sharp(d.data, { raw: { width: d.W, height: d.H, channels: 3 } }).extract({ left: Math.round(150 * d.W / 1284), top, width: Math.round(984 * d.W / 1284), height: Math.round(110 * d.W / 1284) }).resize(492).png().toBuffer());
    }
    const sh = (await sharp(strips[0]).metadata()).height; const cols = 2; const rows = Math.ceil(strips.length / cols);
    await sharp({ create: { width: cols * 492, height: rows * sh, channels: 3, background: '#000' } })
      .composite(strips.map((input, i) => ({ input, left: (i % cols) * 492, top: Math.floor(i / cols) * sh }))).png().toFile(path.join(SCRATCH, 'headers.png'));
    console.log(`check images written to ${SCRATCH}`);
  }

  if (problems.length) { console.log(`${problems.length} problem(s):\n${problems.join('\n')}`); process.exit(2); }
  if (CHECK) { console.log('--check: detection and frame colours agree with the expected order. Nothing written to public/.'); return; }

  // ---- write ----
  const manifestPath = path.join(OUT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = 2;
  manifest.pieces = GEAR_GUIDE_PIECES.pieces;
  manifest.sources = {
    'owner-art': 'owner-supplied 384px art: hat/shirt/ring (cavalry, infantry, archer) and Red T3..T6 of pendant/pants/baton',
    'gear-guide-screenshot': `cropped from the in-game Gear Guide screenshots (${SIDE}px); brightness lifted, padlock-free (see composited)`,
  };
  manifest.governorGearEntries = {};
  for (const [folder, v] of Object.entries(GEAR_GUIDE_PIECES.pieces)) {
    if (folder.includes('-2')) continue;
    manifest.governorGearEntries[folder] = Object.fromEntries(GOVERNOR_GEAR_STATES.map((s) => [gearImageKey(s), { piece: v.piece, source: 'owner-art', usableAsTemplate: true }]));
  }
  let total = 0; let count = 0;
  for (const piece of NEW_PIECES) {
    const folder = GEAR_GUIDE_PIECES.folderFor[piece];
    const dir = path.join(OUT, 'governor-gear', folder);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    manifest.governorGear[folder] = {}; manifest.governorGearEntries[folder] = {};
    for (const r of recs) {
      const key = gearImageKey(r.state);
      const item = plan[piece][key];
      if (item.status === 'unavailable') continue;
      const dest = path.join(dir, `${key}.webp`);
      await toWebp(finish(item.rgb), dest);
      total += fs.statSync(dest).size; count++;
      manifest.governorGear[folder][key] = `/images/loadout/governor-gear/${folder}/${key}.webp`;
      manifest.governorGearEntries[folder][key] = { piece, source: 'gear-guide-screenshot', usableAsTemplate: item.status === 'real', ...(item.status === 'repaired' ? { composited: `padlock/highlight removed: base ${item.from} + label corner and star strip of this tile` } : {}) };
    }
    // Red T3..T6 from the owner's 384px files (same pipeline as import-loadout-images.mjs)
    for (const state of GOVERNOR_GEAR_STATES.filter((x) => x.quality === 'red' && x.tier >= 3)) {
      const key = gearImageKey(state);
      const srcFile = path.join(RED_DIR, RED_FOLDERS[piece], `Red T${state.tier}${state.stars}.jpg`);
      if (!fs.existsSync(srcFile)) { problems.push(`missing ${srcFile}`); continue; }
      const { data, info } = await sharp(srcFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== 384 || info.height !== 384) problems.push(`unexpected size ${info.width}x${info.height}: ${srcFile}`);
      const dest = path.join(dir, `${key}.webp`);
      await sharp(removeWhite(data, info.width, info.height), { raw: { width: info.width, height: info.height, channels: 4 } })
        .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 }).toFile(dest);
      total += fs.statSync(dest).size; count++;
      manifest.governorGear[folder][key] = `/images/loadout/governor-gear/${folder}/${key}.webp`;
      manifest.governorGearEntries[folder][key] = { piece, source: 'owner-art', usableAsTemplate: true };
    }
  }
  if (problems.length) { console.log(`${problems.length} problem(s):\n${problems.join('\n')}`); process.exit(2); }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${count} images, ${(total / 1024 / 1024).toFixed(2)} MB (webp q${QUALITY}, ${SIDE}px).`);
}
main();
