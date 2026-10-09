// Shared alliance helpers (pure, safe for server and client): landing order,
// band colour fallback and the small label tables. No alliance is special-cased
// beyond the fixed landing order and its named colour tokens; any new tag works.

export const LEGACY_ALLIANCE_TAGS = ['710', 'RED', 'SKY'];

// Fixed order of the landing grid: top-left, top-right, bottom-left, bottom-right.
export const LANDING_ORDER = ['710', 'RED', 'SKY', 'PHL'];

// Tags that own a named colour token (--wb-710, --wb-red, --wb-sky, --wb-phl).
const NAMED_BANDS = new Set(LANDING_ORDER);

// Any other tag borrows one of these generic tokens (--wb-x1 .. --wb-x4).
export const FALLBACK_HUES = 4;

export const STATUS_LABEL = { open: 'Recruiting', selective: 'Selective', closed: 'Closed' };
export const STATUS_TONE = { open: 'success', selective: 'accent', closed: 'neutral' };

const upper = (tag) => String(tag ?? '').trim().toUpperCase();

/** Stable 1..4 hue slot for an unnamed tag (same tag always gets the same colour); '' for the named four. */
export function bandHue(tag) {
  const t = upper(tag);
  if (!t || NAMED_BANDS.has(t)) return '';
  let h = 0;
  for (let i = 0; i < t.length; i += 1) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return String((h % FALLBACK_HUES) + 1);
}

/** Props for any element carrying the alliance colour: spread onto a `.k-wb` element. */
export function bandProps(tag) {
  const hue = bandHue(tag);
  return hue ? { 'data-band': upper(tag), 'data-hue': hue } : { 'data-band': upper(tag) };
}

/**
 * Landing order: 710, RED, SKY, PHL first (when present), then every other
 * alliance by sort_order (then tag). Never adds placeholders for missing ones.
 */
export function orderAlliancesForLanding(alliances = []) {
  const list = (Array.isArray(alliances) ? alliances : []).filter((a) => a && a.tag);
  const rank = (a) => LANDING_ORDER.indexOf(upper(a.tag));
  const fixed = list.filter((a) => rank(a) >= 0).sort((a, b) => rank(a) - rank(b));
  const rest = list
    .filter((a) => rank(a) < 0)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.tag).localeCompare(String(b.tag)));
  return [...fixed, ...rest];
}

/** Facts line used on the landing boxes (omits anything not set). */
export function allianceMetaParts(alliance = {}) {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const roster = Number(alliance.roster_size);
  return [
    text(alliance.language),
    alliance.roster_size != null && alliance.roster_size !== '' && Number.isFinite(roster) && roster > 0 ? `${roster} members` : '',
    text(alliance.timezone_focus),
  ].filter(Boolean);
}
