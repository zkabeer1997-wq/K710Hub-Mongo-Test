// Charm level reader. A charm's level is drawn as a SHAPE (triangle, rectangle, diamond ... then
// ornaments: bronze wings, silver shield, gold crest), and the troop sets the colour and icon.
// The troop is known from the slot, so each gem is matched only against that troop's 22 templates.
//
// Pipeline for one gem window (a small crop around the gem):
//   1. estimate the background as a plane fitted to the window border (robust to a gradient),
//   2. foreground = pixels that differ from that plane, cleaned to the blob at the centre,
//   3. crop to the blob's box and resample to GRID x GRID (silhouette coverage + colour),
//   4. score every level: silhouette overlap, colour agreement, box aspect.
// Nothing is guessed: a weak or ambiguous match lowers confidence and lists alternatives.
// Pure and runtime-agnostic: pixels are { width, height, data: RGBA }.

export const CHARM_GRID = 24;
export const CHARM_TROOPS = ['cavalry', 'infantry', 'archer'];
const G = CHARM_GRID;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function decode(b64) {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Turns charmTemplates.json into { troop: [{ level, aspect, mask(0-1), rgb(0-255) }] }. */
export function decodeCharmTemplates(json) {
  if (!json || json.grid !== G || !json.troops) throw new RangeError('charm templates do not match the reader grid');
  const out = {};
  for (const [troop, list] of Object.entries(json.troops)) {
    out[troop] = list.map((t) => ({
      level: t.level, aspect: t.aspect, coreAspect: t.coreAspect, metal: t.metal, ornamentShare: t.ornamentShare,
      mask: Float32Array.from(decode(t.mask), (v) => v / 255),
      core: Float32Array.from(decode(t.core), (v) => v / 255),
      rgb: decode(t.rgb),
    }));
  }
  return out;
}

/** Hue band of each troop's gem body (measured on the owner's screenshots); s/v floors keep backgrounds out. */
export const CORE_HUE = {
  cavalry: { h0: 172, h1: 218, s: 0.5, v: 0.45 },
  infantry: { h0: 68, h1: 132, s: 0.5, v: 0.45 },
  archer: { h0: 44, h1: 66, s: 0.62, v: 0.55 },
};

function hueOf(r, g, b) {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (!d) return { h: 0, s: 0, v: mx / 255 };
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s: d / mx, v: mx / 255 };
}

/** Real gems cut from labelled screenshots: [{ troop, level, aspect, coreAspect, mask, core, rgb }]. */
export function decodeCharmExemplars(json) {
  if (!json || json.grid !== G || !Array.isArray(json.items)) throw new RangeError('charm exemplars do not match the reader grid');
  return json.items.map((t) => ({
    troop: t.troop, level: t.level, aspect: t.aspect, coreAspect: t.coreAspect, metal: t.metal, ornamentShare: t.ornamentShare,
    mask: Float32Array.from(decode(t.mask), (v) => v / 255),
    core: Float32Array.from(decode(t.core), (v) => v / 255),
    rgb: decode(t.rgb),
  }));
}

/** Bounding box of a 0/1 mask, or null when empty. */
function boxOf(mask, w, h) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (mask[y * w + x]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Mask of pixels in the troop's gem-body hue band. */
export function coreMaskOf(pixels, troop) {
  const band = CORE_HUE[troop];
  const { width: w, height: h, data } = pixels;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (data[i * 4 + 3] < 128) continue;
    const c = hueOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (c.h >= band.h0 && c.h <= band.h1 && c.s >= band.s && c.v >= band.v) out[i] = 1;
  }
  return out;
}

/** Square dilation by r pixels (separable max). */
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h); const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k += 1) v = mask[y * w + k];
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k += 1) v = tmp[k * w + x];
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 0 bronze, 1 silver, 2 gold, -1 none: the ornament metals around the gem body (not the body itself). */
function metalClass(r, g, b) {
  const c = hueOf(r, g, b);
  if (c.s < 0.28 && c.v > 0.45) return 1;
  if (c.h >= 38 && c.h <= 60 && c.s > 0.6 && c.v > 0.7) return 2;
  if (c.h >= 14 && c.h <= 42 && c.s >= 0.3 && c.s <= 0.8 && c.v >= 0.3 && c.v <= 0.9) return 0;
  return -1;
}

/**
 * Resample the OBJECT's bounding box to GRID x GRID: object coverage, gem-body (core) coverage and
 * average colour of the object. Used for both the art templates and the observed gem.
 * @returns {{ mask: Float32Array, core: Float32Array, rgb: Float32Array, aspect: number, box: object, coreFraction: number } | null}
 */
export function summarizeBox(pixels, mask, core) {
  const { width: w, height: h, data } = pixels;
  const box = boxOf(mask, w, h);
  if (!box) return null;
  const cov = new Float32Array(G * G); const cov2 = new Float32Array(G * G); const cnt = new Float32Array(G * G);
  const rgb = new Float32Array(G * G * 3); const rgbN = new Float32Array(G * G);
  const bodyZone = core ? dilate(core, w, h, Math.max(1, Math.round(box.w * 0.06))) : null;
  let coreN = 0; let objN = 0; const metal = [0, 0, 0]; let metalN = 0;
  for (let y = box.y0; y <= box.y1; y += 1) {
    const gy = Math.min(G - 1, Math.floor(((y - box.y0) * G) / box.h));
    for (let x = box.x0; x <= box.x1; x += 1) {
      const gx = Math.min(G - 1, Math.floor(((x - box.x0) * G) / box.w));
      const c = gy * G + gx; const i = y * w + x;
      cnt[c] += 1;
      if (mask[i]) {
        objN += 1; cov[c] += 1; rgbN[c] += 1;
        if (core && core[i]) { cov2[c] += 1; coreN += 1; } else if (!bodyZone || !bodyZone[i]) {
          const k = metalClass(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
          metalN += 1; if (k >= 0) metal[k] += 1;
        }
        rgb[c * 3] += data[i * 4]; rgb[c * 3 + 1] += data[i * 4 + 1]; rgb[c * 3 + 2] += data[i * 4 + 2];
      }
    }
  }
  for (let c = 0; c < G * G; c += 1) {
    cov[c] = cnt[c] ? cov[c] / cnt[c] : 0;
    cov2[c] = cnt[c] ? cov2[c] / cnt[c] : 0;
    if (rgbN[c]) { rgb[c * 3] /= rgbN[c]; rgb[c * 3 + 1] /= rgbN[c]; rgb[c * 3 + 2] /= rgbN[c]; }
  }
  const coreBox = core ? boxOf(core, w, h) : null;
  return { mask: cov, core: cov2, rgb, aspect: box.w / box.h, coreAspect: coreBox ? coreBox.w / coreBox.h : box.w / box.h, box, coreFraction: objN ? coreN / objN : 0,
    // share of the ornament pixels (object minus body) that are bronze / silver / gold, and how much ornament there is
    metal: [metal[0] / Math.max(1, metalN), metal[1] / Math.max(1, metalN), metal[2] / Math.max(1, metalN)], ornamentShare: objN ? metalN / objN : 0 };
}

function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i += 1) {
    let p = i;
    for (let r = i + 1; r < 3; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-9) return [0, 0, b[2] / Math.max(1, A[2][2])];
    for (let r = 0; r < 3; r += 1) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c += 1) M[r][c] -= f * M[i][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** Background plane (per channel a + b*x + c*y) fitted to the pixels where `use` is 1, trimming outliers. */
function fitBackground(pixels, use) {
  const { width: w, height: h, data } = pixels;
  const pts = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (use[y * w + x]) pts.push([x, y, (y * w + x) * 4]);
  if (pts.length < 20) return null;
  let keep = pts; let planes = []; let sigma = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    let sxx = 0; let sxy = 0; let sx = 0; let syy = 0; let sy = 0; const n = keep.length;
    for (const [x, y] of keep) { sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; }
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    planes = [];
    for (let ch = 0; ch < 3; ch += 1) {
      let bx = 0; let by = 0; let b1 = 0;
      for (const [x, y, o] of keep) { const v = data[o + ch]; bx += x * v; by += y * v; b1 += v; }
      planes.push(solve3(A, [bx, by, b1]));
    }
    const res = pts.map(([x, y, o]) => {
      let d = 0;
      for (let ch = 0; ch < 3; ch += 1) { const p = planes[ch]; const e = data[o + ch] - (p[0] * x + p[1] * y + p[2]); d += e * e; }
      return Math.sqrt(d);
    });
    const sorted = [...res].sort((a, b) => a - b);
    sigma = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const cut = Math.max(12, sigma * 3);
    const next = pts.filter((_, i) => res[i] <= cut);
    if (next.length < 20) break;
    keep = next;
  }
  return { sigma, at: (x, y, ch) => planes[ch][0] * x + planes[ch][1] * y + planes[ch][2] };
}

/** Connected blob of `raw` that overlaps `seed` the most (4-neighbour), holes filled. */
function blobOverlapping(raw, seed, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const hits = []; const sizes = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!raw[s] || label[s] !== -1) continue;
    const id = sizes.length; let size = 0; let hit = 0;
    const stack = [s]; label[s] = id;
    while (stack.length) {
      const p = stack.pop(); size += 1; if (seed[p]) hit += 1;
      const x = p % w; const y = (p - x) / w;
      if (x > 0 && raw[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && raw[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && raw[p - w] && label[p - w] === -1) { label[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && raw[p + w] && label[p + w] === -1) { label[p + w] = id; stack.push(p + w); }
    }
    sizes.push(size); hits.push(hit);
  }
  let best = -1;
  hits.forEach((v, id) => { if (v > 0 && (best < 0 || v > hits[best])) best = id; });
  if (best < 0) return null;
  const blob = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) blob[i] = label[i] === best ? 1 : 0;
  const outside = new Uint8Array(w * h); const st = [];
  const push = (i) => { if (!blob[i] && !outside[i]) { outside[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x += 1) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const p = st.pop(); const x = p % w; const y = (p - x) / w;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  for (let i = 0; i < w * h; i += 1) if (!outside[i]) blob[i] = 1;
  return blob;
}

/**
 * Find the gem in a window and summarise it. The gem BODY is found by the troop's hue (reliable on any
 * background); ornaments (wings, base, shield) are the pixels around it that differ from the background.
 * @returns {{ ok: boolean, flags: string[], summary?: object }}
 */
export function observeGem(pixels, troop) {
  const { width: w, height: h, data } = pixels;
  const core0 = coreMaskOf(pixels, troop);
  const centre = new Uint8Array(w * h);
  for (let y = Math.floor(h * 0.3); y < Math.ceil(h * 0.7); y += 1) for (let x = Math.floor(w * 0.3); x < Math.ceil(w * 0.7); x += 1) centre[y * w + x] = 1;
  const core = blobOverlapping(core0, centre, w, h);
  if (!core) return { ok: false, flags: ['no_gem_found'] };
  const cb = boxOf(core, w, h);
  if (cb.w < w * 0.25 || cb.h < h * 0.25) return { ok: false, flags: ['gem_too_small'] };
  // Background = window pixels well outside the gem body's box.
  const mx = Math.round(cb.w * 0.7); const my = Math.round(cb.h * 0.7);
  const RING = 3;
  const far = new Uint8Array(w * h); const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inBox = x >= cb.x0 - mx && x <= cb.x1 + mx && y >= cb.y0 - my && y <= cb.y1 + my;
      if (inBox) near[y * w + x] = 1;
      if (!inBox || x < RING || y < RING || x >= w - RING || y >= h - RING) far[y * w + x] = 1;
    }
  }
  const bg = fitBackground(pixels, far);
  const raw = new Uint8Array(w * h);
  if (bg) {
    const thr = Math.max(24, bg.sigma * 3.5);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (!near[i]) continue;
        const o = i * 4; let d = 0;
        for (let ch = 0; ch < 3; ch += 1) { const e = data[o + ch] - bg.at(x, y, ch); d += e * e; }
        raw[i] = Math.sqrt(d) > thr ? 1 : 0;
      }
    }
  }
  for (let i = 0; i < w * h; i += 1) if (core[i]) raw[i] = 1;
  const object = blobOverlapping(raw, core, w, h);
  const summary = summarizeBox(pixels, object, core);
  const flags = [];
  const b = summary.box;
  if (b.x0 <= 1 || b.y0 <= 1 || b.x1 >= w - 2 || b.y1 >= h - 2) flags.push('gem_touches_window_edge');
  if (!bg) flags.push('no_background_reference');
  return { ok: true, flags, summary };
}

/** Score weights (see docs/charm-shapes.md for how they were chosen). */
export const CHARM_WEIGHTS = { shape: 0.3, core: 0.3, colour: 0.1, aspect: 0.1, metal: 0.2 };

function overlap(a, b) {
  let inter = 0; let uni = 0;
  for (let c = 0; c < G * G; c += 1) { inter += Math.min(a[c], b[c]); uni += Math.max(a[c], b[c]); }
  return uni ? inter / uni : 0;
}

export const ORNAMENT_PRESENT = 0.1;

export function scoreTemplate(obs, tpl, { colour: fixedColour } = {}) {
  let cd = 0; let cn = 0;
  for (let c = 0; c < G * G; c += 1) {
    if (obs.mask[c] > 0.5 && tpl.mask[c] > 0.5) {
      cd += (Math.abs(obs.rgb[c * 3] - tpl.rgb[c * 3]) + Math.abs(obs.rgb[c * 3 + 1] - tpl.rgb[c * 3 + 1]) + Math.abs(obs.rgb[c * 3 + 2] - tpl.rgb[c * 3 + 2])) / 765;
      cn += 1;
    }
  }
  const shape = overlap(obs.mask, tpl.mask);
  const core = overlap(obs.core, tpl.core);
  const colour = fixedColour ?? (cn ? clamp01(1 - (cd / cn) * 2.5) : 0);
  const aspect = clamp01(1 - Math.abs(Math.log(obs.coreAspect / tpl.coreAspect)) * 3);
  // Ornament metals (bronze / silver / gold): informative only when either side really has ornaments;
  // on plain gems the "ornament" pixels are just outline and highlights, so there it counts as agreement.
  const hasOrnament = Math.max(obs.ornamentShare, tpl.ornamentShare) > ORNAMENT_PRESENT;
  const metalDiff = (Math.abs(obs.metal[0] - tpl.metal[0]) + Math.abs(obs.metal[1] - tpl.metal[1]) + Math.abs(obs.metal[2] - tpl.metal[2])) / 2;
  const metal = hasOrnament ? clamp01(1 - metalDiff * 0.9 - Math.abs(obs.ornamentShare - tpl.ornamentShare) * 1.5) : 1;
  const w = CHARM_WEIGHTS;
  return { total: w.shape * shape + w.core * core + w.colour * colour + w.aspect * aspect + w.metal * metal, shape, core, colour, aspect, metal };
}

export const CONFIDENT_BEST = 0.8;
export const CONFIDENT_MARGIN = 0.04;

/** Levels with no real (screenshot) exemplar are matched on the supplied art only: keep them in review. */
export const ART_ONLY_CONFIDENCE_CAP = 0.79;

/**
 * Read one charm level from a gem window.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} windowPixels crop around the gem
 * @param {'cavalry'|'infantry'|'archer'} troop slot's troop
 * @param {ReturnType<typeof decodeCharmTemplates>} templates art templates for every troop
 * @param {ReturnType<typeof decodeCharmExemplars>} [exemplars] real gems; a level with one is "verified on real screenshots"
 * @returns {{ value: number|null, confidence: number, alternatives: {value:number,confidence:number}[], flags: string[] }}
 */
export function readCharmLevel(windowPixels, troop, templates, exemplars = []) {
  const list = templates[troop];
  if (!list) throw new RangeError(`unknown troop "${troop}"`);
  const seen = observeGem(windowPixels, troop);
  if (!seen.ok) return { value: null, confidence: 0, alternatives: [], flags: seen.flags };
  const real = new Set(exemplars.map((e) => e.level));
  const ranked = list.map((t) => {
    const art = scoreTemplate(seen.summary, t);
    let total = art.total;
    for (const e of exemplars) if (e.level === t.level) total = Math.max(total, scoreTemplate(seen.summary, e, { colour: art.colour }).total);
    return { level: t.level, total };
  }).sort((a, b) => b.total - a.total);
  const [best, second] = ranked;
  const margin = best.total - second.total;
  const flags = [...seen.flags];
  if (margin < 0.04) flags.push('close_second_choice');
  // Calibrated on 689 labelled gems (leave-one-image-out): best score >= 0.8 AND a gap of >= 0.04 to the
  // runner-up was right 98% of the time; anything weaker was right far less often and stays under 0.8.
  const passes = best.total >= CONFIDENT_BEST && margin >= CONFIDENT_MARGIN;
  let confidence = passes
    ? 0.8 + 0.2 * Math.min(1, ((margin - CONFIDENT_MARGIN) / 0.08 + (best.total - CONFIDENT_BEST) / 0.15) / 2)
    : 0.79 * clamp01(0.4 + 0.6 * Math.min(margin / CONFIDENT_MARGIN, best.total / CONFIDENT_BEST));
  if (!real.has(best.level)) {
    flags.push('art_only_level');
    confidence = Math.min(confidence, ART_ONLY_CONFIDENCE_CAP);
  }
  return {
    value: best.level,
    confidence: Number(confidence.toFixed(3)),
    alternatives: ranked.slice(1, 4).map((r) => ({ value: r.level, confidence: Number(clamp01(r.total).toFixed(3)) })),
    flags,
  };
}

/** Serialisable summary of one real gem, for charmExemplars.json (null when no gem is found). */
export function harvestExemplar(windowPixels, troop, level) {
  const seen = observeGem(windowPixels, troop);
  if (!seen.ok || seen.flags.length) return null;
  const s = seen.summary;
  const b64 = (arr) => Buffer.from(arr).toString('base64');
  return {
    troop, level, aspect: Number(s.aspect.toFixed(4)), coreAspect: Number(s.coreAspect.toFixed(4)),
    metal: s.metal.map((v) => Number(v.toFixed(4))), ornamentShare: Number(s.ornamentShare.toFixed(4)),
    mask: b64(Uint8Array.from(s.mask, (v) => Math.round(v * 255))),
    core: b64(Uint8Array.from(s.core, (v) => Math.round(v * 255))),
    rgb: b64(Uint8Array.from(s.rgb, (v) => Math.round(v))),
  };
}
