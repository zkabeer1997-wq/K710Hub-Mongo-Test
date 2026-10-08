// Browser-only: turn a picked File into RGBA pixels for the scan engine. The file is read in memory and never
// uploaded, stored or kept as an object URL. The pure helpers (validateUpload, scaledSize) also run in Node tests.
import { checkImageBytes } from '../imageCheck.mjs';

export const MAX_SCAN_WIDTH = 1500;
export const MAX_SCAN_PIXELS = 50_000_000;
export const DECODE_FAILED_MESSAGE = "We couldn't read that image. Try a different screenshot.";

/** Size after downscaling so the width is at most maxWidth (aspect kept, never enlarged). */
export function scaledSize(width, height, maxWidth = MAX_SCAN_WIDTH) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/** Byte-level check with a friendly one-sentence message. */
export function validateUpload(bytes) {
  const check = checkImageBytes(bytes);
  if (check.ok) return { ok: true };
  const detail = check.reasons[0] || '';
  return { ok: false, message: `${detail} Try a different screenshot (PNG, JPEG or WebP).`.trim() };
}

/** @returns {Promise<{ ok: true, pixels: { width: number, height: number, data: Uint8ClampedArray } } | { ok: false, message: string }>} */
export async function decodeImageFile(file) {
  let bitmap = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = validateUpload(bytes);
    if (!valid.ok) return valid;
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > MAX_SCAN_PIXELS) return { ok: false, message: 'That image is too large. Try a normal phone screenshot.' };
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { ok: true, pixels: { width, height, data } };
  } catch {
    return { ok: false, message: DECODE_FAILED_MESSAGE };
  } finally {
    bitmap?.close?.();
  }
}
