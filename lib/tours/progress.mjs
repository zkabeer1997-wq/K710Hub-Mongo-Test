// Pure helpers for walkthrough ("tour") completion. No DOM, no network, so they are unit tested.
//
// Two stores are merged: this device (localStorage `k710-tour:<id>:v<version>`) and, for signed-in
// members, one row in member_tool_state (tool_key `tour-progress`) shaped
//   { completed: { <tourId>: { version, ts } }, skipped: { <tourId>: { version, ts } } }
// "Done on either side wins": a tour that is completed or skipped anywhere is not auto-started again.
// Replaying by hand is always possible; replaying never has to clear anything.

export const TOUR_TOOL_KEY = 'tour-progress';
export const TOUR_STORAGE_PREFIX = 'k710-tour:';

/** localStorage key for one tour at one version. */
export function localKey(id, version) {
  return `${TOUR_STORAGE_PREFIX}${id}:v${version}`;
}

export function emptyProgress() {
  return { completed: {}, skipped: {} };
}

function cleanEntries(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, entry] of Object.entries(raw)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
    const version = Number(entry?.version);
    if (!Number.isInteger(version) || version < 1) continue;
    const ts = typeof entry?.ts === 'string' ? entry.ts : '';
    out[id] = { version, ts };
  }
  return out;
}

/** Whatever came back from the server (or garbage) -> a safe progress object. */
export function normalizeProgress(raw) {
  return { completed: cleanEntries(raw?.completed), skipped: cleanEntries(raw?.skipped) };
}

function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.version !== b.version) return a.version > b.version ? a : b;
  return String(a.ts) >= String(b.ts) ? a : b;
}

function mergeEntries(a, b) {
  const out = { ...a };
  for (const [id, entry] of Object.entries(b)) out[id] = newer(out[id], entry);
  return out;
}

/** Union of two progress objects: for every tour the highest version (then latest time) wins. */
export function mergeProgress(a, b) {
  const x = normalizeProgress(a);
  const y = normalizeProgress(b);
  return { completed: mergeEntries(x.completed, y.completed), skipped: mergeEntries(x.skipped, y.skipped) };
}

/** Has this tour (at this version or newer) been finished or skipped in `progress`? */
export function isTourSettled(progress, id, version) {
  const p = normalizeProgress(progress);
  return [p.completed[id], p.skipped[id]].some((entry) => entry && entry.version >= version);
}

/** Record an outcome. kind: 'completed' | 'skipped'. Returns a new object. */
export function markTour(progress, id, version, kind, ts = new Date().toISOString()) {
  const bucket = kind === 'skipped' ? 'skipped' : 'completed';
  return mergeProgress(progress, { [bucket]: { [id]: { version, ts } } });
}

/** What is stored in localStorage for one tour: '{"state":"completed"|"skipped","ts":"..."}'. */
export function serializeLocal(kind, ts = new Date().toISOString()) {
  return JSON.stringify({ state: kind === 'skipped' ? 'skipped' : 'completed', ts });
}

/** Parse a localStorage value; null when absent or unreadable. */
export function parseLocal(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value && (value.state === 'completed' || value.state === 'skipped')) {
      return { state: value.state, ts: typeof value.ts === 'string' ? value.ts : '' };
    }
  } catch { /* fall through */ }
  return null;
}

/** Fold one local entry into a progress object (for tour id/version). */
export function progressFromLocal(id, version, local) {
  if (!local) return emptyProgress();
  return markTour(emptyProgress(), id, version, local.state, local.ts);
}

/**
 * Should the tour start by itself? Only once per user per version, never in the admin area,
 * never before the page says it is ready.
 */
export function shouldAutoStart({ settled, pathname = '', ready = true, audienceMatches = true }) {
  if (!ready || !audienceMatches || settled) return false;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return false;
  return true;
}
