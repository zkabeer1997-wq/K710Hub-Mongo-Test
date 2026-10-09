// Browser-only: crop an image to its centred rectangle of a fixed aspect and resize it (canvas, no
// server dependency). The geometry lives in lib/squareCrop.mjs (coverCropRect) so it is unit tested.
// cropToSquareFile (guide pictures) and cropToAspectFile (alliance photos) share one implementation.
import { GUIDE_IMAGE_MIN_SIDE, coverCropRect } from '../../lib/squareCrop.mjs';

export class CropError extends Error {}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * @param {Blob} blob   JPG, PNG, WebP or GIF (a GIF keeps its first frame)
 * @param {{width:number, height:number, minWidth:number, minHeight?:number, maxBytes?:number, name?:string,
 *          tooSmall?:(w:number,h:number)=>string}} options
 *        width/height: output size (its ratio is the crop aspect); minWidth/minHeight: refuse smaller sources.
 * @returns {Promise<File>} a width x height WebP (JPEG where WebP encoding is unavailable)
 */
export async function cropToAspectFile(blob, { width, height, minWidth = 0, minHeight = 0, maxBytes = 0, name = 'picture', tooSmall } = {}) {
  let bitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new CropError('This file could not be read as an image. Try a JPG, PNG or WebP.'); }
  try {
    if (bitmap.width < minWidth || bitmap.height < minHeight) {
      throw new CropError(tooSmall ? tooSmall(bitmap.width, bitmap.height) : `This image is too small (${bitmap.width} x ${bitmap.height}). Use one that is at least ${minWidth} x ${minHeight}.`);
    }
    const { sx, sy, sw, sh } = coverCropRect(bitmap.width, bitmap.height, width / height);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    let out = await canvasToBlob(canvas, 'image/webp', 0.86);
    if (!out || out.type !== 'image/webp') out = await canvasToBlob(canvas, 'image/jpeg', 0.88);
    // Very detailed photos can exceed the server cap: step the quality down until it fits.
    for (const q of [0.74, 0.62, 0.5]) {
      if (!out || !maxBytes || out.size <= maxBytes) break;
      out = await canvasToBlob(canvas, out.type, q);
    }
    if (!out) throw new CropError('The picture could not be prepared. Try a different image.');
    if (maxBytes && out.size > maxBytes) throw new CropError('This picture is too detailed to shrink under 2 MB. Try a simpler image.');
    const ext = out.type === 'image/webp' ? 'webp' : 'jpg';
    const base = String(name).replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'picture';
    return new File([out], `${base}-${width}x${height}.${ext}`, { type: out.type });
  } finally { bitmap.close?.(); }
}

/**
 * Guide pictures: a size x size WebP of the centred square.
 * @param {{size?:number, minSide?:number, name?:string}} options
 */
export async function cropToSquareFile(blob, { size = 512, minSide = GUIDE_IMAGE_MIN_SIDE, name = 'picture' } = {}) {
  const file = await cropToAspectFile(blob, {
    width: size, height: size, name,
    // Square rule: the SHORT side must reach minSide.
    minWidth: minSide, minHeight: minSide,
    tooSmall: (w, h) => `This image is too small (${w} x ${h}). Use one that is at least ${minSide} x ${minSide}.`,
  });
  // Keep the historical file name (<name>-<size>.<ext>).
  return new File([file], file.name.replace(`-${size}x${size}.`, `-${size}.`), { type: file.type });
}
