// Dependency-free crop geometry shared by the browser crop (components/admin/cropSquare.js) and tests.
export const GUIDE_IMAGE_SIZE = 512;
export const GUIDE_IMAGE_MIN_SIDE = 256;

/**
 * The largest centred rectangle of the given aspect (width / height) inside a width x height image.
 * `sw` x `sh` is the source rectangle to draw; it never exceeds the image.
 */
export function coverCropRect(width, height, aspect) {
  const a = Number(aspect) > 0 ? Number(aspect) : 1;
  let sw = width;
  let sh = Math.round(width / a);
  if (sh > height) { sh = height; sw = Math.round(height * a); }
  return { sx: Math.floor((width - sw) / 2), sy: Math.floor((height - sh) / 2), sw, sh };
}

/** The largest centred square of a width x height image. */
export function squareCropRect(width, height) {
  const { sx, sy, sw } = coverCropRect(width, height, 1);
  return { sx, sy, side: sw };
}
