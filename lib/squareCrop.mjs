// Dependency-free crop geometry shared by the browser crop (components/admin/cropSquare.js) and tests.
export const GUIDE_IMAGE_SIZE = 512;
export const GUIDE_IMAGE_MIN_SIDE = 256;

/** The largest centred square of a width x height image. */
export function squareCropRect(width, height) {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}
