#!/usr/bin/env node
// Import the owner-supplied Governor Gear / Charm art for the Power Profile loadout board.
//
// Origin:  owner-supplied game art, ~/Downloads/Kingshot_Gear_Charms/ (read only):
//            Governor Gear/{Archer,Cavalry,Infantry}/<Quality> <stars>.jpg | <Quality> T<tier><stars>.jpg  (58 each, 384x384)
//            Charms/{Archer,Cavalry,Infantry}/Level <n>.jpg                                                (22 each, 384x384)
//          Each troop folder holds ONE gear piece: Cavalry = hat, Infantry = shirt, Archer = ring.
// Purpose: shown on the loadout board now; kept at full 384px so they can be the OCR templates later.
// Output:  public/images/loadout/governor-gear/<troop>/<quality>-t<tier>-s<stars>.webp
//          public/images/loadout/charms/<troop>/level-<n>.webp
//          public/images/loadout/manifest.json
// Background: the white/light area outside the art is removed by a flood fill from the image border over near-white
//          pixels (so white INSIDE the art, e.g. gem highlights, is kept), then a 2px feathered edge un-mixes the white.
// Usage:   node scripts/import-loadout-images.mjs [sourceDir]      (idempotent and deterministic; no timestamps in the images)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CHARM_LEVELS, GOVERNOR_GEAR_STATES, QUALITIES } from '../lib/scan/kinds/governorProfile/gameData.mjs';
import { LOADOUT_TROOPS, charmImageFor, gearImageKey, sourceGearFileName } from '../lib/loadoutImages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images/loadout');
const SRC = path.resolve((process.argv[2] || '~/Downloads/Kingshot_Gear_Charms').replace(/^~/, os.homedir()));
const SIZE = 384;
const QUALITY = Number(process.env.LOADOUT_WEBP_QUALITY || 85);
const WHITE_MIN = 232; // min(R,G,B) at or above this counts as background
const NAME = new Map(QUALITIES.map((q) => [q.id, q.name]));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** RGB buffer -> RGBA buffer with the border-connected light background made transparent and a soft edge. */
function removeBackground(rgb, w, h) {
  const n = w * h;
  const minc = new Uint8Array(n);
  for (let i = 0; i < n; i++) minc[i] = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (i) => { if (!bg[i] && minc[i] >= WHITE_MIN) { bg[i] = 1; stack.push(i); } };
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

async function convert(src, dest, problems) {
  if (!fs.existsSync(src)) { problems.push(`missing source: ${src}`); return 0; }
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== SIZE || info.height !== SIZE) problems.push(`unexpected size ${info.width}x${info.height}: ${src}`);
  const rgba = removeBackground(data, info.width, info.height);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
    .toFile(dest);
  return fs.statSync(dest).size;
}

async function main() {
  if (!fs.existsSync(SRC)) { console.error(`Source folder not found: ${SRC}`); process.exit(1); }
  const problems = [];
  const manifest = { version: 1, generated_at: null, governorGear: {}, charms: {} };
  let total = 0; let count = 0;
  const used = new Set();
  for (const troop of LOADOUT_TROOPS) {
    manifest.governorGear[troop] = {};
    manifest.charms[troop] = {};
    for (const state of GOVERNOR_GEAR_STATES) {
      const key = gearImageKey(state);
      const rel = `governor-gear/${troop}/${key}.webp`;
      const src = path.join(SRC, 'Governor Gear', cap(troop), sourceGearFileName(state, NAME.get(state.quality)));
      total += await convert(src, path.join(OUT, rel), problems); count++;
      manifest.governorGear[troop][key] = `/images/loadout/${rel}`;
      used.add(path.join('Governor Gear', cap(troop), path.basename(src)));
    }
    for (const level of CHARM_LEVELS) {
      const rel = charmImageFor(troop, level).replace('/images/loadout/', '');
      const src = path.join(SRC, 'Charms', cap(troop), `Level ${level}.jpg`);
      total += await convert(src, path.join(OUT, rel), problems); count++;
      manifest.charms[troop][level] = `/images/loadout/${rel}`;
      used.add(path.join('Charms', cap(troop), path.basename(src)));
    }
  }
  // surplus source files nobody maps to
  for (const group of ['Governor Gear', 'Charms']) {
    for (const troop of LOADOUT_TROOPS) {
      const dir = path.join(SRC, group, cap(troop));
      if (!fs.existsSync(dir)) { problems.push(`missing folder: ${dir}`); continue; }
      for (const f of fs.readdirSync(dir)) if (/\.jpe?g$/i.test(f) && !used.has(path.join(group, cap(troop), f))) problems.push(`surplus source file: ${path.join(group, cap(troop), f)}`);
    }
  }
  manifest.generated_at = process.env.LOADOUT_MANIFEST_DATE || '2026-10-08'; // fixed so reruns stay byte-identical
  fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Converted ${count} images, ${(total / 1024 / 1024).toFixed(2)} MB total (webp q${QUALITY}).`);
  console.log(problems.length ? `${problems.length} problem(s):\n${problems.join('\n')}` : 'No problems: every state/level maps to a source file, no surplus files.');
  if (problems.length) process.exitCode = 2;
}
main();
