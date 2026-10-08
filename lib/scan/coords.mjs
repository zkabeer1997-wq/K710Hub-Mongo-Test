// Normalised coordinate system for layout profiles.
//
// MATHS
// A profile is drawn on a REFERENCE screenshot. Every rect in it (regions and the anchor)
// is stored in "reference units": 0-1 across the reference image width (u) and height (v).
// The profile also stores the anchor's expected rect E = {x:ex, y:ey, w:ew, h:eh} in those units.
//
// At scan time the anchor is found in the real image at pixel rect D = {x:dx, y:dy, w:dw, h:dh}.
// The anchor's OWN width and height give the scale on each axis independently:
//     sx = dw / ew        (pixels per reference-width unit)
//     sy = dh / eh        (pixels per reference-height unit)
//     x0 = dx - ex * sx,  y0 = dy - ey * sy      (pixel position of reference origin)
// and a reference point (u, v) maps to the pixel (x0 + u*sx, y0 + v*sy).
// Frame = { x0, y0, scale: sx, aspect: sy / sx }.
// Because the vertical scale comes from the anchor's height (not from the image height), a
// taller or shorter phone that draws the same anchor at the same size still lines up:
// aspect captures the difference. The image size is only used for clamping/rounding.

function assertRect(r, name) {
  if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite)) throw new RangeError(`${name} must have finite x,y,w,h`);
}

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ x0: number, y0: number, scale: number, aspect: number }} AnchorFrame
 */

/**
 * @param {Rect} detectedAnchorPx anchor found in the image, in pixels
 * @param {Rect} expectedAnchorNorm anchor in the profile, reference units (0-1)
 * @param {{ width: number, height: number }} imageSize
 * @returns {AnchorFrame}
 */
export function frameFromAnchor(detectedAnchorPx, expectedAnchorNorm, imageSize) {
  assertRect(detectedAnchorPx, 'detectedAnchorPx');
  assertRect(expectedAnchorNorm, 'expectedAnchorNorm');
  if (!imageSize || !(imageSize.width > 0) || !(imageSize.height > 0)) throw new RangeError('imageSize must be positive');
  if (!(detectedAnchorPx.w > 0 && detectedAnchorPx.h > 0)) throw new RangeError('detected anchor must have positive size');
  if (!(expectedAnchorNorm.w > 0 && expectedAnchorNorm.h > 0)) throw new RangeError('expected anchor must have positive size');
  const sx = detectedAnchorPx.w / expectedAnchorNorm.w;
  const sy = detectedAnchorPx.h / expectedAnchorNorm.h;
  return {
    x0: detectedAnchorPx.x - expectedAnchorNorm.x * sx,
    y0: detectedAnchorPx.y - expectedAnchorNorm.y * sy,
    scale: sx,
    aspect: sy / sx,
  };
}

/** Intersect a rect with bounds (default the unit square). Result may have w or h = 0. */
export function clampRect(rect, bounds = { x: 0, y: 0, w: 1, h: 1 }) {
  assertRect(rect, 'rect');
  const x0 = Math.max(rect.x, bounds.x);
  const y0 = Math.max(rect.y, bounds.y);
  const x1 = Math.min(rect.x + rect.w, bounds.x + bounds.w);
  const y1 = Math.min(rect.y + rect.h, bounds.y + bounds.h);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Reference units -> pixels. By default clamped to the image and rounded outward to whole pixels.
 * Pass { clamp: false, round: false } for the exact float inverse of pxToNorm.
 */
export function normToPx(rect, frame, imageSize, { clamp = true, round = true } = {}) {
  assertRect(rect, 'rect');
  const sy = frame.scale * frame.aspect;
  let out = {
    x: frame.x0 + rect.x * frame.scale,
    y: frame.y0 + rect.y * sy,
    w: rect.w * frame.scale,
    h: rect.h * sy,
  };
  if (clamp) out = clampRect(out, { x: 0, y: 0, w: imageSize.width, h: imageSize.height });
  if (round) {
    const x0 = Math.floor(out.x); const y0 = Math.floor(out.y);
    const x1 = Math.ceil(out.x + out.w); const y1 = Math.ceil(out.y + out.h);
    out = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return out;
}

/** Pixels -> reference units (exact inverse of normToPx with clamp:false, round:false). */
export function pxToNorm(rectPx, frame) {
  assertRect(rectPx, 'rectPx');
  const sy = frame.scale * frame.aspect;
  return {
    x: (rectPx.x - frame.x0) / frame.scale,
    y: (rectPx.y - frame.y0) / sy,
    w: rectPx.w / frame.scale,
    h: rectPx.h / sy,
  };
}

/** True when the rects share positive area (touching edges do not overlap). */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Intersection over union, 0-1. */
export function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}
