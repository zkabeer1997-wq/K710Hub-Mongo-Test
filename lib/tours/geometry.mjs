// Pure layout maths for the walkthrough popover (no DOM), so it can be unit tested.
// Rects are { top, left, width, height } in viewport pixels (getBoundingClientRect).

export const SHEET_BREAKPOINT = 768; // below this the popover is a bottom sheet

export function isSheet(viewportWidth) {
  return viewportWidth < SHEET_BREAKPOINT;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/** The highlighted box: the element's rect grown by `pad`, kept inside the viewport. */
export function spotRect(rect, viewport, pad = 6) {
  const left = Math.max(0, rect.left - pad);
  const top = Math.max(0, rect.top - pad);
  const right = Math.min(viewport.width, rect.left + rect.width + pad);
  const bottom = Math.min(viewport.height, rect.top + rect.height + pad);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Where to put the popover on wide screens.
 * placement: 'auto' | 'top' | 'bottom' | 'start' | 'end'  (start/end are logical, dir picks the physical side)
 * insets: space reserved at the top (sticky header) and bottom (sticky bars) of the viewport.
 * Returns { top, left, side } where side is 'top' | 'bottom' | 'left' | 'right' | 'over' (no room: sits over the target).
 */
export function placePopover({ rect, size, viewport, insets = { top: 0, bottom: 0 }, placement = 'auto', dir = 'ltr', gap = 14, margin = 12 }) {
  const minTop = insets.top + margin;
  const maxBottom = viewport.height - insets.bottom - margin;
  const spaceAbove = rect.top - minTop - gap;
  const spaceBelow = maxBottom - (rect.top + rect.height) - gap;
  const spaceLeft = rect.left - margin - gap;
  const spaceRight = viewport.width - (rect.left + rect.width) - margin - gap;

  let want = placement;
  if (want === 'start') want = dir === 'rtl' ? 'right' : 'left';
  else if (want === 'end') want = dir === 'rtl' ? 'left' : 'right';

  const fits = {
    top: spaceAbove >= size.height,
    bottom: spaceBelow >= size.height,
    left: spaceLeft >= size.width,
    right: spaceRight >= size.width,
  };
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  let side = null;
  if (want !== 'auto' && fits[want]) side = want;
  else if (want !== 'auto' && fits[opposite[want]]) side = opposite[want];
  if (!side) {
    const order = ['bottom', 'top', 'right', 'left'];
    side = order.find((s) => fits[s]) || null;
  }
  if (!side) {
    // Nothing fits beside the target (a very tall section): float over its lower area, inside the safe zone.
    const top = clamp(maxBottom - size.height, minTop, maxBottom - size.height);
    const left = clamp(rect.left + (rect.width - size.width) / 2, margin, viewport.width - size.width - margin);
    return { top, left, side: 'over' };
  }

  let top;
  let left;
  if (side === 'top' || side === 'bottom') {
    top = side === 'bottom' ? rect.top + rect.height + gap : rect.top - gap - size.height;
    left = clamp(rect.left + (rect.width - size.width) / 2, margin, viewport.width - size.width - margin);
  } else {
    left = side === 'right' ? rect.left + rect.width + gap : rect.left - gap - size.width;
    top = clamp(rect.top + (rect.height - size.height) / 2, minTop, maxBottom - size.height);
  }
  return { top, left, side };
}

/**
 * Does the target need scrolling, and to where? Returns the window.scrollY delta (0 = leave it).
 * On a phone the sheet covers the bottom `insets.bottom` pixels, so the target must sit above it.
 */
export function scrollDelta({ rect, viewportHeight, insets = { top: 0, bottom: 0 }, margin = 16, reserved = 0 }) {
  // A bar stuck to the bottom edge stays put however far the page scrolls: nothing to bring into view.
  if (reserved > 0 && rect.top >= viewportHeight - reserved - 2 && rect.top < viewportHeight) return 0;
  const top = insets.top + margin;
  const bottom = viewportHeight - insets.bottom - margin;
  const room = bottom - top;
  if (rect.height > room) {
    // Taller than the free area: show its start.
    return Math.abs(rect.top - top) < 2 ? 0 : rect.top - top;
  }
  if (rect.top < top) return rect.top - top;
  if (rect.top + rect.height > bottom) return rect.top + rect.height - bottom;
  return 0;
}

/**
 * Space to keep clear at the bottom of the viewport: the part of each sticky bar that is stuck to the bottom edge.
 * bars: rects of elements marked data-tour-reserve.
 */
export function reservedBottom(bars, viewportHeight) {
  let reserved = 0;
  for (const bar of bars) {
    if (bar.height <= 0) continue;
    const bottom = bar.top + bar.height;
    if (bottom >= viewportHeight - 2 && bar.top < viewportHeight) reserved = Math.max(reserved, viewportHeight - bar.top);
  }
  return reserved;
}
