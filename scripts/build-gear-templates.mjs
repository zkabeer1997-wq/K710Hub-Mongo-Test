// Builds lib/scan/kinds/governorProfile/gearTemplates.json:
//   * frame colour per quality, label map per tier (T1-T6)  <- from the owner's gear ART
//     (public/images/loadout/governor-gear/<slot dir>/<quality>-t<tier>-s<stars>.webp, 58 states x 6 pieces)
//   * the star template and decision thresholds             <- from the REAL labelled screenshots
//     (tests/fixtures/scan/governor_profile/labels.json "gear" entries), because the art's stars are drawn
//     sharper than the in-game ones.
// Re-run after the art or the gear labels change:  npm run scan:gear
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  normaliseTile, tileFeatures, labelMask, starMap, starScores, labelCorr, LABEL_W, LABEL_H, STAR_BOXES, STAR_WINDOW,
} from '../lib/scan/readers/gearTileReader.mjs';
import { gearWindows } from '../lib/scan/kinds/governorProfile/gear.mjs';
import { crop } from '../lib/scan/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ART = path.join(ROOT, 'public/images/loadout/governor-gear');
const FIX = path.join(ROOT, 'tests/fixtures/scan/governor_profile');
const OUT = path.join(ROOT, 'lib/scan/kinds/governorProfile/gearTemplates.json');
const DIRS = ['cavalry', 'cavalry-2', 'infantry', 'infantry-2', 'archer', 'archer-2'];
const b64 = (arr) => Buffer.from(arr).toString('base64');

// ---- art tiles
const art = [];
for (const dir of DIRS) {
  for (const file of fs.readdirSync(path.join(ART, dir)).sort()) {
    const [quality, t, s] = file.replace('.webp', '').split('-');
    const { data, info } = await sharp(path.join(ART, dir, file)).flatten({ background: '#7a8fa6' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const tile = normaliseTile({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
    art.push({ quality, tier: Number(t.slice(1)), stars: Number(s.slice(1)), tile, f: tileFeatures(tile) });
  }
}

// ---- real labelled tiles
const labels = JSON.parse(fs.readFileSync(path.join(FIX, 'labels.json'), 'utf8'));
const real = [];
for (const [file, lab] of Object.entries(labels.images)) {
  if (!lab.gear || !fs.existsSync(path.join(FIX, file))) continue;
  const { data, info } = await sharp(path.join(FIX, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const windows = gearWindows(px);
  for (const [slot, g] of Object.entries(lab.gear)) {
    if (!windows?.[slot]) continue;
    const tile = normaliseTile(crop(px, windows[slot].rect));
    real.push({ quality: g.quality, tier: g.tier, stars: g.stars, tile, f: tileFeatures(tile) });
  }
}

// ---- frame colour per quality (circular mean of hue) from art + real
const frames = [];
for (const quality of ['green', 'blue', 'purple', 'gold', 'red']) {
  const list = [...art, ...real].filter((t) => t.quality === quality);
  let sx = 0; let sy = 0; let s = 0; let v = 0;
  for (const t of list) { const r = (t.f.frame[0] * Math.PI) / 180; sx += Math.cos(r); sy += Math.sin(r); s += t.f.frame[1]; v += t.f.frame[2]; }
  frames.push({ quality, h: Number((((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360).toFixed(1)), s: Number((s / list.length).toFixed(3)), v: Number((v / list.length).toFixed(3)) });
}

// ---- tier label maps. Real classes (T1-T4, P1, P2) come from the label crops of the cropped account images, whose
// label text was read by eye (tests/fixtures/scan/governor_profile/gear-tier-labels.json); T5 and T6 have no real
// example yet and come from the art (flagged, lower confidence).
const tierLabels = JSON.parse(fs.readFileSync(path.join(FIX, 'gear-tier-labels.json'), 'utf8')).labels;
const byClass = new Map();
const noneMasks = [];
for (const [key, cls] of Object.entries(tierLabels)) {
  const [file, slot] = key.split(':');
  if (!fs.existsSync(path.join(FIX, file))) continue;
  const { data, info } = await sharp(path.join(FIX, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const w = gearWindows(px)?.[slot];
  if (!w) continue;
  const mask = labelMask(normaliseTile(crop(px, w.rect))).mask;
  if (cls === 'none') { noneMasks.push(mask); continue; }
  if (!byClass.has(cls)) byClass.set(cls, []);
  byClass.get(cls).push(mask);
}
const meanOf = (list) => { const m = new Float32Array(LABEL_W * LABEL_H); for (const x of list) for (let i = 0; i < m.length; i += 1) m[i] += x[i] / list.length; return m; };
const classes = [];
for (const id of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'P1', 'P2']) {
  const hasReal = byClass.has(id);
  // "P1" / "P2" are T1 / T2 drawn with a P (owner confirmed): own glyph template, same tier
  if (hasReal) classes.push({ id, tier: Number(id.slice(1)), source: 'real', hasReal, mean: meanOf(byClass.get(id)), n: byClass.get(id).length });
  if (id[0] !== 'T') continue;
  // art template for every tier too: crisp captures (e.g. straight device screenshots) look more like the art
  const list = art.filter((x) => x.tier === Number(id.slice(1))).map((x) => x.f.label.mask);
  classes.push({ id, tier: Number(id.slice(1)), source: 'art', hasReal, mean: meanOf(list), n: list.length });
}
const bestOf = (mask) => Math.max(...classes.map((c) => labelCorr(mask, c.mean)));
const labelled = [...byClass.values()].flat().map(bestOf);
const none = noneMasks.map(bestOf);
const noLabelCorr = Number(((Math.max(...none.filter((v, i, a) => v <= [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.99)])) + Math.min(...labelled.filter((v, i, a) => v >= [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.01)]))) / 2).toFixed(3));
// real tile check, independent of the cluster labels: the two labelled full screenshots
let realOk = 0; let realN = 0;
for (const r of real) {
  const scored = classes.map((c) => ({ c, v: labelCorr(r.f.label.mask, c.mean) })).sort((a, b) => b.v - a.v);
  const read = scored[0].v < noLabelCorr ? 0 : scored[0].c.tier;
  realN += 1; if (read === r.tier) realOk += 1;
}
console.log(`tier classes: ${classes.map((c) => `${c.id}(${c.source},n=${c.n})`).join(' ')}; no-label n=${noneMasks.length}`);
console.log(`label corr: no-label p99 ${Math.max(...none).toFixed(3)} | labelled p1 ${Math.min(...labelled).toFixed(3)} -> noLabelCorr ${noLabelCorr}`);
console.log(`tier on the 12 labelled tiles of the two full screenshots (not used for fitting): ${realOk}/${realN}`);

// ---- star template: centroid-aligned mean of star spots that really hold a star on the real tiles
const M = STAR_WINDOW;
const tpl = new Float32Array(M * M); let nT = 0;
for (const r of real) {
  for (let bi = 0; bi < r.stars; bi += 1) {
    const [x0, y0, x1, y1] = STAR_BOXES[bi];
    const m = starMap(r.tile, (x0 + x1) / 2, (y0 + y1) / 2);
    let sx = 0; let sy = 0; let sw = 0;
    for (let y = 0; y < M; y += 1) for (let x = 0; x < M; x += 1) { sx += x * m[y * M + x]; sy += y * m[y * M + x]; sw += m[y * M + x]; }
    const ox = Math.round(sx / sw - (M - 1) / 2); const oy = Math.round(sy / sw - (M - 1) / 2);
    for (let y = 0; y < M; y += 1) for (let x = 0; x < M; x += 1) { const xx = x + ox; const yy = y + oy; if (xx >= 0 && yy >= 0 && xx < M && yy < M) tpl[y * M + x] += m[yy * M + xx]; }
    nT += 1;
  }
}
for (let i = 0; i < tpl.length; i += 1) tpl[i] /= nT;
// quantise the template to bytes, then fit the threshold on the real tiles (and report the art)
const tplBytes = Uint8Array.from(tpl, (v) => Math.round(Math.min(1, v) * 255));
const tplQ = Float32Array.from(tplBytes, (v) => v / 255);
const on = []; const off = [];
for (const r of real) starScores(r.tile, tplQ).forEach((v, i) => (i < r.stars ? on : off).push(v));
const artOn = []; const artOff = [];
for (const a of art) starScores(a.tile, tplQ).forEach((v, i) => (i < a.stars ? artOn : artOff).push(v));
const threshold = Number(((Math.min(...on) + Math.max(...off)) / 2).toFixed(3));

fs.writeFileSync(OUT, `${JSON.stringify({
  version: 1, frames,
  labels: classes.map((c) => ({ id: c.id, tier: c.tier, source: c.source, hasReal: c.hasReal, mask: b64(Uint8Array.from(c.mean, (v) => Math.round(Math.min(1, v) * 255))) })),
  star: { template: b64(tplBytes), threshold }, noLabelCorr,
})}\n`);
console.log('frames', JSON.stringify(frames));
console.log(`star score (real tiles): present min ${Math.min(...on).toFixed(3)} | empty max ${Math.max(...off).toFixed(3)} -> threshold ${threshold} (from ${nT} real stars)`);
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
console.log(`star score (art, not used for fitting): present p5 ${q(artOn, 0.05).toFixed(2)} p50 ${q(artOn, 0.5).toFixed(2)} | empty p95 ${q(artOff, 0.95).toFixed(2)} p99.5 ${q(artOff, 0.995).toFixed(2)}`);
