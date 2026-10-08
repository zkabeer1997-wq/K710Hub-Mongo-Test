// Builds lib/scan/kinds/governorProfile/charmTemplates.json from the owner's charm art
// (public/images/loadout/charms/<troop>/level-<n>.webp, 22 levels x 3 troops).
// Each template is the art cropped to its opaque bounding box and resampled to GRID x GRID:
// a coverage mask (silhouette) and an average colour per cell, plus the box aspect ratio.
// Re-run after the art changes:  node scripts/build-charm-templates.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CHARM_GRID, summarizeBox, coreMaskOf } from '../lib/scan/readers/charmReader.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ART = path.join(ROOT, 'public/images/loadout/charms');
const OUT = path.join(ROOT, 'lib/scan/kinds/governorProfile/charmTemplates.json');
const TROOPS = ['cavalry', 'infantry', 'archer'];

const b64 = (arr) => Buffer.from(arr).toString('base64');
const out = { version: 1, grid: CHARM_GRID, troops: {} };

for (const troop of TROOPS) {
  out.troops[troop] = [];
  for (let level = 1; level <= 22; level += 1) {
    const { data, info } = await sharp(path.join(ART, troop, `level-${level}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width; const h = info.height;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) mask[i] = data[i * 4 + 3] > 128 ? 1 : 0;
    const px = { width: w, height: h, data };
    const t = summarizeBox(px, mask, coreMaskOf(px, troop));
    out.troops[troop].push({
      level, aspect: Number(t.aspect.toFixed(4)), coreAspect: Number(t.coreAspect.toFixed(4)), metal: t.metal.map((v) => Number(v.toFixed(4))), ornamentShare: Number(t.ornamentShare.toFixed(4)),
      mask: b64(Uint8Array.from(t.mask, (v) => Math.round(v * 255))),
      core: b64(Uint8Array.from(t.core, (v) => Math.round(v * 255))),
      rgb: b64(Uint8Array.from(t.rgb, (v) => Math.round(v))),
    });
  }
}
fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
