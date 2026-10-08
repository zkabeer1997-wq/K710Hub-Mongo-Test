// Pixel helpers. A pixel image is { width, height, data } with data RGBA (Uint8ClampedArray|Uint8Array).
// All functions are pure and deterministic and return NEW objects.

function assertPixels(p) {
  if (!p || !Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 1 || p.height < 1) {
    throw new RangeError('pixels must have positive integer width and height');
  }
  if (!p.data || p.data.length < p.width * p.height * 4) {
    throw new RangeError('pixels.data is too short for width*height RGBA');
  }
}

function make(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function resizeArea(p, tw, th) {
  const out = make(tw, th);
  const sx = p.width / tw;
  const sy = p.height / th;
  for (let y = 0; y < th; y += 1) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < tw; x += 1) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0; let g = 0; let b = 0; let a = 0; let wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1) && yy < p.height; yy += 1) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1) && xx < p.width; xx += 1) {
          const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
          const i = (yy * p.width + xx) * 4;
          r += p.data[i] * w; g += p.data[i + 1] * w; b += p.data[i + 2] * w; a += p.data[i + 3] * w;
          wsum += w;
        }
      }
      const o = (y * tw + x) * 4;
      out.data[o] = Math.round(r / wsum); out.data[o + 1] = Math.round(g / wsum);
      out.data[o + 2] = Math.round(b / wsum); out.data[o + 3] = Math.round(a / wsum);
    }
  }
  return out;
}

function resizeBilinear(p, tw, th) {
  const out = make(tw, th);
  const sx = p.width / tw;
  const sy = p.height / th;
  for (let y = 0; y < th; y += 1) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), p.height - 1);
    const y0 = Math.floor(fy); const y1 = Math.min(y0 + 1, p.height - 1); const ty = fy - y0;
    for (let x = 0; x < tw; x += 1) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), p.width - 1);
      const x0 = Math.floor(fx); const x1 = Math.min(x0 + 1, p.width - 1); const tx = fx - x0;
      const o = (y * tw + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = p.data[(y0 * p.width + x0) * 4 + c] * (1 - tx) + p.data[(y0 * p.width + x1) * 4 + c] * tx;
        const bot = p.data[(y1 * p.width + x0) * 4 + c] * (1 - tx) + p.data[(y1 * p.width + x1) * 4 + c] * tx;
        out.data[o + c] = Math.round(top * (1 - ty) + bot * ty);
      }
    }
  }
  return out;
}

/** Resize to an explicit size. Area-average when shrinking both axes, bilinear otherwise. */
export function resizeTo(pixels, targetWidth, targetHeight) {
  assertPixels(pixels);
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth < 1 || targetHeight < 1) {
    throw new RangeError('target size must be positive integers');
  }
  if (targetWidth === pixels.width && targetHeight === pixels.height) {
    return { width: pixels.width, height: pixels.height, data: new Uint8ClampedArray(pixels.data.subarray(0, pixels.width * pixels.height * 4)) };
  }
  return targetWidth <= pixels.width && targetHeight <= pixels.height
    ? resizeArea(pixels, targetWidth, targetHeight)
    : resizeBilinear(pixels, targetWidth, targetHeight);
}

/** Resize keeping the aspect ratio so the width equals targetWidth (height rounded, min 1). */
export function resizeToWidth(pixels, targetWidth) {
  assertPixels(pixels);
  if (!Number.isInteger(targetWidth) || targetWidth < 1) throw new RangeError('targetWidth must be a positive integer');
  const th = Math.max(1, Math.round((pixels.height * targetWidth) / pixels.width));
  return resizeTo(pixels, targetWidth, th);
}

/** Greyscale (Rec.601 luma), still RGBA so it stays a normal pixel object. Alpha kept. */
export function toGrey(pixels) {
  assertPixels(pixels);
  const out = make(pixels.width, pixels.height);
  const n = pixels.width * pixels.height;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const g = Math.round(0.299 * pixels.data[o] + 0.587 * pixels.data[o + 1] + 0.114 * pixels.data[o + 2]);
    out.data[o] = g; out.data[o + 1] = g; out.data[o + 2] = g; out.data[o + 3] = pixels.data[o + 3];
  }
  return out;
}

/** Crop to a pixel rect {x,y,w,h}; clamped to the image. Throws if nothing remains. */
export function crop(pixels, rect) {
  assertPixels(pixels);
  if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) throw new RangeError('rect must have finite x,y,w,h');
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(pixels.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(pixels.height, Math.ceil(rect.y + rect.h));
  if (x1 <= x0 || y1 <= y0) throw new RangeError('crop rect is empty after clamping to the image');
  const out = make(x1 - x0, y1 - y0);
  for (let y = y0; y < y1; y += 1) {
    const src = (y * pixels.width + x0) * 4;
    out.data.set(pixels.data.subarray(src, src + (x1 - x0) * 4), (y - y0) * out.width * 4);
  }
  return out;
}

/** Enlarge by a factor >= 1 (bilinear). Output size is round(size * factor). */
export function scaleUp(pixels, factor) {
  assertPixels(pixels);
  if (!Number.isFinite(factor) || factor < 1) throw new RangeError('factor must be a finite number >= 1');
  return resizeBilinear(pixels, Math.round(pixels.width * factor), Math.round(pixels.height * factor));
}
