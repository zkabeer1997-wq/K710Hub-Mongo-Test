// Walkthrough ("tour") registry. Pure data + a few pure helpers; the UI lives in components/tour/.
//
// A tour is a short click-through that highlights real elements of a form. Steps never change form
// state: they only point at elements marked with a data-tour="<name>" attribute in the page source.
// All text lives in i18n/en.json under the `tour.` prefix (tour.<tourId>.<n>.title / .body), so the
// walkthrough follows the visitor's language. Keep game terms in English (i18n/glossary.json).
//
//   anchor    value of the data-tour attribute to highlight
//   placement 'auto' | 'top' | 'bottom' | 'start' | 'end'   (start/end are logical: they flip in RTL)
//   optional  the anchor only exists in some situations (answer Yes first, a later wizard step ...).
//             A step whose anchor is missing or hidden is skipped silently either way.
//   follows   the form is a wizard: the tour keeps running while the visitor moves between wizard
//             steps and picks up the tips of the new step as they become visible.
//
// audience 'member' = signed-in members (completion is also mirrored to the member's saved state);
// 'applicant' = anonymous visitors (this device only).

export const TOUR_BODY_MAX = 330; // characters; longer text does not fit a phone bottom sheet comfortably

function steps(tourId, rows) {
  return rows.map(([anchor, placement = 'auto', optional = false], index) => ({
    id: `${tourId}-${index + 1}`,
    anchor,
    placement,
    optional,
    titleKey: `tour.${tourId}.${index + 1}.title`,
    bodyKey: `tour.${tourId}.${index + 1}.body`,
  }));
}

export const TOURS = {
  prep: {
    id: 'prep', version: 1, audience: 'member', route: '/prep-phase-backpack', follows: false,
    steps: steps('prep', [
      ['prep-intro', 'bottom'],
      ['prep-name', 'bottom'],
      ['prep-day1', 'bottom'],
      ['prep-times', 'top', true],
      ['prep-review', 'top'],
      ['prep-save', 'top'],
    ]),
  },
  avail: {
    id: 'avail', version: 1, audience: 'member', route: '/dashboard/form', follows: false,
    steps: steps('avail', [
      ['avail-intro', 'bottom'],
      ['avail-alliance', 'bottom'],
      ['avail-timing', 'top'],
      ['avail-troops', 'auto'],
      ['avail-heroes', 'auto'],
      ['avail-save', 'top'],
    ]),
  },
  dragon: {
    id: 'dragon', version: 1, audience: 'member', route: '/flamedragon', follows: false,
    steps: steps('dragon', [
      ['dragon-intro', 'bottom'],
      ['dragon-alliance', 'bottom'],
      ['dragon-troops', 'auto'],
      ['dragon-heroes', 'auto'],
      ['dragon-power', 'auto'],
      ['dragon-timing', 'top'],
      ['dragon-submit', 'top'],
    ]),
  },
  noble: {
    id: 'noble', version: 1, audience: 'member', route: '/forms/flamedragon-tyrant/noble-advisor', follows: false,
    steps: steps('noble', [
      ['noble-intro', 'bottom'],
      ['noble-questions', 'auto'],
      ['noble-times', 'top'],
      ['noble-save', 'top'],
      ['noble-appointment', 'bottom'],
    ]),
  },
  power: {
    id: 'power', version: 1, audience: 'member', route: '/power-profile', follows: true,
    steps: steps('power', [
      ['power-steps', 'bottom'],
      ['power-details', 'bottom'],
      ['power-scan', 'bottom', true],
      ['power-board', 'end', true],
      ['power-review', 'top', true],
      ['power-save', 'top', true],
    ]),
  },
  interest: {
    id: 'interest', version: 2, audience: 'applicant', route: '/interest', follows: true,
    steps: steps('interest', [
      ['interest-progress', 'bottom'],
      ['interest-verify', 'bottom', true],
      ['interest-identity', 'auto', true],
      ['interest-nav', 'top'],
      ['interest-move', 'auto', true],
      ['interest-power', 'auto', true],
      ['interest-shots', 'auto', true],
      ['interest-review', 'top', true],
    ]),
  },
  dash: {
    id: 'dash', version: 1, audience: 'member', route: '/dashboard', follows: false,
    steps: steps('dash', [
      ['dash-account', 'bottom'],
      ['dash-forms', 'bottom'],
      ['dash-first-form', 'bottom', true],
      ['dash-power', 'top', true],
      ['dash-links', 'top'],
      ['dash-gifts', 'top', true],
    ]),
  },
};

export const TOUR_IDS = Object.keys(TOURS);

export function getTour(id) {
  return Object.prototype.hasOwnProperty.call(TOURS, id) ? TOURS[id] : null;
}

/** Every catalog key a tour needs (titles and bodies). */
export function tourKeys(tour) {
  return tour.steps.flatMap((step) => [step.titleKey, step.bodyKey]);
}

export const TOUR_UI_KEYS = [
  'tour.ui.next', 'tour.ui.back', 'tour.ui.skip', 'tour.ui.done', 'tour.ui.replay', 'tour.ui.take',
  'tour.ui.stepOf', 'tour.ui.live', 'tour.ui.more', 'tour.ui.esc',
];

/** The steps whose anchor is currently usable, in config order. `isAvailable(step)` is supplied by the DOM layer. */
export function availableSteps(tour, isAvailable) {
  return tour.steps.filter((step) => {
    try { return Boolean(isAvailable(step)); } catch { return false; }
  });
}

/**
 * Keep the walkthrough on the right step when the set of available steps changes (the visitor moved to
 * another wizard step, a section opened ...). Stays on the current step while it is available; otherwise
 * moves to the next available step after it in config order, else the closest earlier one, else null.
 */
export function reanchor(tour, currentId, available) {
  if (!available.length) return null;
  if (available.some((step) => step.id === currentId)) return currentId;
  const order = tour.steps.map((step) => step.id);
  const at = order.indexOf(currentId);
  const later = available.find((step) => order.indexOf(step.id) > at);
  return (later || available[available.length - 1]).id;
}

/** True when config steps after `currentId` exist but are not available right now (more tips may appear). */
export function hasPendingLater(tour, currentId, available) {
  const order = tour.steps.map((step) => step.id);
  const at = order.indexOf(currentId);
  const ids = new Set(available.map((step) => step.id));
  return tour.steps.some((step, index) => index > at && !ids.has(step.id));
}

/** Logical placement to a physical side for the document direction. */
export function physicalPlacement(placement, dir) {
  if (placement === 'start') return dir === 'rtl' ? 'right' : 'left';
  if (placement === 'end') return dir === 'rtl' ? 'left' : 'right';
  return placement;
}

/** Realm for public applicant pages, Console for member pages (DESIGN.md). */
export function tourTone(tour) {
  return tour.audience === 'applicant' ? 'realm' : 'console';
}
