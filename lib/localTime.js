// Shared time formatting for the Bear Hunt schedule.
//
// Alliance times are stored and reasoned about in UTC (the game's clock), but
// a member in Eastern or Pacific time should not have to do timezone math to
// know when a hunt fires. The rule across the site: show the viewer's LOCAL
// time first, with UTC in parentheses for reference — the same treatment the
// Events page already uses.
//
// These are pure functions with no React dependency so they can be unit
// tested and reused by any client component. Local conversion depends on the
// runtime's timezone (the browser's for a viewer, process TZ under Node), so
// callers guard the first server render and only upgrade to local once
// mounted, avoiding a hydration mismatch.

/**
 * Convert an "HH:MM" 24-hour UTC time to a localized clock label for today's
 * date (e.g. "10:32 AM"). Returns null when the input is not a valid HH:MM so
 * the caller can fall back to the raw UTC string.
 *
 * @param {string} hm - UTC time as "H:MM" or "HH:MM"
 * @returns {string|null}
 */
export function utcHmToLocal(hm) {
  if (typeof hm !== 'string') return null;
  const match = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const now = new Date();
  const utcDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes),
  );
  return utcDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Human label for one Bear Hunt time. Local-first, UTC in parentheses:
 * "10:32 AM (12:00 UTC)". Before hydration (or when local can't be derived)
 * it falls back to the plain "12:00 UTC" string so the server-rendered markup
 * still carries real content.
 *
 * @param {string} hm - UTC time as "H:MM" or "HH:MM"
 * @param {{ mounted?: boolean }} [options] - mounted=false forces the UTC fallback
 * @returns {string}
 */
export function bearTimeLabel(hm, { mounted = true } = {}) {
  const local = mounted ? utcHmToLocal(hm) : null;
  return local ? `${local} (${hm} UTC)` : `${hm} UTC`;
}
