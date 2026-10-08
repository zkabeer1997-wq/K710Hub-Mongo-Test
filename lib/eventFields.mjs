// Additive event fields shared by the admin events API and the calendar UI.
// guide_slug links an event to a guide page; alliance_tags is empty for "all alliances".
export const GUIDE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
export const ALLIANCE_TAG_RE = /^[A-Za-z0-9]{1,8}$/;
export const MAX_ALLIANCE_TAGS = 10;

// Returns { fields } holding only the keys present in `body` (so PUT stays partial),
// or { error }. `withDefaults` fills the missing keys for new events.
export function validateEventExtras(body = {}, { withDefaults = false } = {}) {
  const fields = {};
  if (body.guide_slug !== undefined || withDefaults) {
    const slug = body.guide_slug == null ? '' : String(body.guide_slug).trim();
    if (slug && !GUIDE_SLUG_RE.test(slug)) return { error: 'Linked guide must be a guide slug (lowercase letters, numbers and hyphens).' };
    fields.guide_slug = slug || null;
  }
  if (body.alliance_tags !== undefined || withDefaults) {
    const raw = body.alliance_tags == null ? [] : body.alliance_tags;
    if (!Array.isArray(raw) || raw.length > MAX_ALLIANCE_TAGS || raw.some(tag => typeof tag !== 'string' || !ALLIANCE_TAG_RE.test(tag.trim()))) {
      return { error: 'Choose alliances from the list, or leave empty for all alliances.' };
    }
    fields.alliance_tags = [...new Set(raw.map(tag => tag.trim().toUpperCase()))];
  }
  return { fields };
}

export function eventAllianceLabel(event) {
  const tags = Array.isArray(event?.alliance_tags) && event.alliance_tags.length ? event.alliance_tags : event?.alliance_tag ? [event.alliance_tag] : [];
  return tags.length ? tags.join(' / ') : 'All alliances';
}

// A linked guide wins; otherwise the existing event detail page.
export function eventHref(event) {
  if (event?.guide_slug && GUIDE_SLUG_RE.test(event.guide_slug)) return `/guides/${event.guide_slug}`;
  return `/events/${event?.slug || ''}`;
}
