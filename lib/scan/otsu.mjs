import { toGrey, scaleUp } from './normalize.mjs';

/** Otsu threshold (0-255) of a pixel image's grey level. Pixels with grey <= threshold form the dark class. */
export function otsuThreshold(pixels) {
  const hist = new Array(256).fill(0);
  const n = pixels.width * pixels.height;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    hist[Math.round(0.299 * pixels.data[o] + 0.587 * pixels.data[o + 1] + 0.114 * pixels.data[o + 2])] += 1;
  }
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t];
  let wB = 0; let sumB = 0; let bestVar = -1; let best = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB; const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) { bestVar = between; best = t; }
  }
  return best;
}

/**
 * Binarise to pure black (0) / white (255), alpha 255.
 * Convention: the glyphs are the MINORITY class. With invertAuto the output always has dark glyphs on a
 * light background (what OCR engines expect): if the dark class is the minority the image is left as is;
 * if the light class is the minority (light text on dark) the output is inverted.
 * @returns {{ pixels: {width:number,height:number,data:Uint8ClampedArray}, threshold: number, inverted: boolean }}
 */
export function binarize(pixels, { invertAuto = true } = {}) {
  const threshold = otsuThreshold(pixels);
  const n = pixels.width * pixels.height;
  const grey = new Uint8Array(n);
  let dark = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    grey[i] = Math.round(0.299 * pixels.data[o] + 0.587 * pixels.data[o + 1] + 0.114 * pixels.data[o + 2]);
    if (grey[i] <= threshold) dark += 1;
  }
  const inverted = invertAuto && dark > n - dark;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    const isDark = grey[i] <= threshold;
    const v = (isDark !== inverted) ? 0 : 255;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  return { pixels: { width: pixels.width, height: pixels.height, data }, threshold, inverted };
}

/** grey -> scale up -> Otsu -> invert if needed. Returns the final bitmap (pixel object). */
export function prepareForOcr(cropPixels, { scale = 3 } = {}) {
  return binarize(scaleUp(toGrey(cropPixels), scale), { invertAuto: true }).pixels;
}
