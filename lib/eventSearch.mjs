/**
 * Pure helper for the Events page's "Upcoming events" search box.
 *
 * Filters a list of event-series objects by title/description, matching the
 * same case-insensitive substring pattern already used by the Tools and
 * Guides directories. Kept dependency-free so it is easy to unit test and
 * safe to call from a Client Component on every keystroke.
 *
 * @param {Array<{title?: string, description?: string}>} events
 * @param {string} query
 * @returns {Array} the subset of `events` whose title or description
 *   contains `query` (case-insensitive). An empty/whitespace-only query
 *   returns the input list unchanged.
 */
export function filterEventsByQuery(events, query) {
  const list = Array.isArray(events) ? events : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((entry) => {
    const event = entry?.event || entry;
    const title = String(event?.title || '').toLowerCase();
    const description = String(event?.description || '').toLowerCase();
    return title.includes(q) || description.includes(q);
  });
}
