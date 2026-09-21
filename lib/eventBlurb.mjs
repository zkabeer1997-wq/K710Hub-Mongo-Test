// Pure helper for the short, one-line description shown under an event's
// countdown on /events (EventCountdownCards.js). Kept dependency-free and
// side-effect-free so it can be unit tested directly (tests/eventBlurb.test.mjs)
// without mounting the React countdown card.

const MAX_LENGTH = 160;

// Known event kinds (see KIND_LABEL in EventCountdownCards.js) get a short
// "what it is + how to prep" line. Anything else falls through to the
// neutral, title-based fallback below so an unrecognized kind still renders
// cleanly instead of showing nothing.
const KIND_BLURBS = {
  kvk: 'Kingdom vs Kingdom war — full kingdom mobilization. Prep: max troops, load gear and charms, and rally with your alliance.',
  championship: 'Championship — cross-kingdom competition for rewards and standing. Prep: coordinate rally targets with kingdom leadership.',
  swordland: 'Swordland — territory control event fought over contested zones. Prep: garrison strong troops and stock resources.',
};

function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, max = MAX_LENGTH) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Return a concise, single-line description for an event, for display
 * under its countdown.
 *
 * Priority:
 *   1. `event.description`, if present — collapsed to one line and
 *      truncated so it never wraps the countdown layout.
 *   2. A derived line for known `event.kind` values (kvk, championship,
 *      swordland), including a short prep hint.
 *   3. A neutral, title-based fallback for any other/unknown kind.
 *
 * @param {{ title?: string, kind?: string, description?: string }} event
 * @returns {string}
 */
export function eventBlurb(event) {
  const description = typeof event?.description === 'string' ? collapseWhitespace(event.description) : '';
  if (description) return truncate(description);

  const kind = typeof event?.kind === 'string' ? event.kind : '';
  if (KIND_BLURBS[kind]) return KIND_BLURBS[kind];

  const title = typeof event?.title === 'string' && event.title.trim() ? event.title.trim() : 'This event';
  return `${title} — kingdom event. Check the event details for prep guidance.`;
}
