// Finds the charm rows on a Governor Profile image WITHOUT knowing its crop or scale.
// Needed for cropped / zoomed images (e.g. square marketplace crops with no title bar). Each troop's gems
// have their own hue, so we look for rows of three gem-coloured blobs of the same size, evenly spaced,
// in the left or right part of the image. Positions come back in pixels with the gem pitch, which also
// gives the scale of the image. Nothing is guessed: a row that does not pass every check is reported missing.
import { CORE_HUE, coreMaskOf } from '../../readers/charmReader.mjs';

/** Label 4-connected blobs; returns [{ x0, y0, x1, y1, area }] for blobs that pass a size filter. */
function blobs(mask, w, h, accept) {
  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!mask[s] || seen[s]) continue;
    let x0 = w; let y0 = h; let x1 = -1; let y1 = -1; let area = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop(); area += 1;
      const x = p % w; const y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    const b = { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area };
    if (accept(b)) out.push(b);
  }
  return out;
}

/** Three blobs in a line: same size, same y, even spacing. */
function triples(list) {
  const found = [];
  const byX = [...list].sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < byX.length; i += 1) {
    for (let j = i + 1; j < byX.length; j += 1) {
      for (let k = j + 1; k < byX.length; k += 1) {
        const [a, b, c] = [byX[i], byX[j], byX[k]];
        const cx = (g) => (g.x0 + g.x1) / 2; const cy = (g) => (g.y0 + g.y1) / 2;
        const size = (a.w + b.w + c.w) / 3;
        const pitch1 = cx(b) - cx(a); const pitch2 = cx(c) - cx(b);
        if (Math.abs(pitch1 - pitch2) > 0.18 * Math.max(pitch1, pitch2)) continue;
        if (pitch1 < 0.9 * size || pitch1 > 2.2 * size) continue;
        if (Math.max(cy(a), cy(b), cy(c)) - Math.min(cy(a), cy(b), cy(c)) > 0.25 * size) continue;
        found.push({ blobs: [a, b, c], pitch: (pitch1 + pitch2) / 2, size });
      }
    }
  }
  return found;
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels
 * @returns {{ rows: { troop: string, side: 'left'|'right', centres: {x:number,y:number}[], pitch: number }[], missing: string[], scale: number|null }}
 *   scale = median gem pitch in pixels (the screenshot's zoom).
 */
export function locateCharmRows(pixels) {
  const { width: w, height: h } = pixels;
  const rows = [];
  const missing = [];
  for (const troop of Object.keys(CORE_HUE)) {
    const mask = coreMaskOf(pixels, troop);
    const list = blobs(mask, w, h, (b) => b.w >= w * 0.015 && b.w <= w * 0.09 && b.h >= w * 0.015 && b.h <= w * 0.09
      && b.w / b.h > 0.45 && b.w / b.h < 2.2 && b.area / (b.w * b.h) > 0.35);
    for (const side of ['left', 'right']) {
      const inSide = list.filter((b) => (side === 'left' ? (b.x0 + b.x1) / 2 < w * 0.42 : (b.x0 + b.x1) / 2 > w * 0.58));
      const cands = triples(inSide);
      if (!cands.length) { missing.push(`${troop}_${side}`); continue; }
      // prefer the candidate whose size is the most common among all candidates (rejects stray colour in the art)
      cands.sort((a, b) => a.size - b.size);
      const best = cands[Math.floor(cands.length / 2)];
      rows.push({
        troop, side, pitch: best.pitch,
        centres: best.blobs.map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 })),
      });
    }
  }
  const pitches = rows.map((r) => r.pitch).sort((a, b) => a - b);
  return { rows, missing, scale: pitches.length ? pitches[Math.floor(pitches.length / 2)] : null };
}
