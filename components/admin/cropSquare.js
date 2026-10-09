// Browser-only: crop an image to its centred square and resize it (canvas, no server dependency).
// The geometry lives in lib/squareCrop.mjs (squareCropRect) so it is unit tested.
import { GUIDE_IMAGE_MIN_SIDE, squareCropRect } from '../../lib/squareCrop.mjs';

export class CropError extends Error {}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * @param {Blob} blob   JPG, PNG, WebP or GIF (a GIF keeps its first frame)
 * @param {{size?:number, minSide?:number, name?:string}} options
 * @returns {Promise<File>} a 'size' x 'size' WebP (JPEG where WebP encoding is unavailable)
 */
export async function cropToSquareFile(blob, { size = 512, minSide = GUIDE_IMAGE_MIN_SIDE, name = 'picture' } = {}) {
  let bitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new CropError('This file could not be read as an image. Try a JPG, PNG or WebP.'); }
  try {
    const { sx, sy, side } = squareCropRect(bitmap.width, bitmap.height);
    if (side < minSide) throw new CropError(`This image is too small (${bitmap.width} x ${bitmap.height}). Use one that is at least ${minSide} x ${minSide}.`);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    let out = await canvasToBlob(canvas, 'image/webp', 0.86);
    if (!out || out.type !== 'image/webp') out = await canvasToBlob(canvas, 'image/jpeg', 0.88);
    if (!out) throw new CropError('The picture could not be prepared. Try a different image.');
    const ext = out.type === 'image/webp' ? 'webp' : 'jpg';
    const base = String(name).replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'picture';
    return new File([out], `${base}-${size}.${ext}`, { type: out.type });
  } finally { bitmap.close?.(); }
}
