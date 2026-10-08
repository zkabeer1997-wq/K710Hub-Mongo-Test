// Pure helpers for deadlines: form windows, countdown text, "due soon", and the
// deadline ticker selection. No React, no Mongo, so it is unit-testable and safe
// to import from client or server code. All instants are epoch ms or ISO strings
// and every calendar rendering is explicitly UTC unless a timeZone is passed.

export const HOUR = 3600e3;
export const DAY = 24 * HOUR;
export const DUE_SOON_MS = 48 * HOUR;

export function toMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * State of a form given its gate row ({ is_open, opens_at, closes_at }).
 * - is_open === false (admin switch)  -> 'closed'
 * - before opens_at                   -> 'upcoming'
 * - after closes_at                   -> 'closed'
 * - otherwise                         -> 'open'
 * With requireWindow, a form that has no opens_at yet counts as 'upcoming'
 * (leadership has not scheduled it), so per-event forms never open by accident.
 */
export function windowState(gate, now = Date.now(), { requireWindow = false } = {}) {
  const opensAt = toMs(gate?.opens_at);
  const closesAt = toMs(gate?.closes_at);
  const base = { opensAt, closesAt };
  if (gate?.is_open === false) return { ...base, state: 'closed', reason: 'admin' };
  if (opensAt === null && requireWindow) return { ...base, state: 'upcoming', reason: 'unscheduled' };
  if (opensAt !== null && now < opensAt) return { ...base, state: 'upcoming', reason: 'window' };
  if (closesAt !== null && now >= closesAt) return { ...base, state: 'closed', reason: 'window' };
  return { ...base, state: 'open', reason: 'window' };
}

const pad = (n) => String(n).padStart(2, '0');

/** "9 days", "5h 12m", "42m", "58s" (seconds only when opted in), "now". */
export function formatCountdown(ms, { seconds = false } = {}) {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  if (ms >= DUE_SOON_MS) {
    const days = Math.floor(ms / DAY);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const totalMin = Math.floor(ms / 60e3);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (seconds && ms < HOUR) {
    const s = Math.floor((ms % 60e3) / 1000);
    return m > 0 ? `${m}m ${pad(s)}s` : `${s}s`;
  }
  if (h === 0) return `${Math.max(m, 1)}m`;
  return `${h}h ${pad(m)}m`;
}

/** Due within 48 hours (and not already past). */
export function isDueSoon(atMs, now = Date.now()) {
  const at = toMs(atMs);
  return at !== null && at > now && at - now <= DUE_SOON_MS;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 5, 14:00 UTC" (adds the year when it is not the current UTC year). */
export function formatUtc(value, now = Date.now()) {
  const ms = toMs(value);
  if (ms === null) return '';
  const d = new Date(ms);
  const year = d.getUTCFullYear() !== new Date(now).getUTCFullYear() ? ` ${d.getUTCFullYear()}` : '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Live clock text: "14:03:07 UTC". */
export function formatClockUtc(ms) {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

/** The sentence an event form shows for its window. */
export function windowMessage(win, { now = Date.now() } = {}) {
  if (win.state === 'open') return win.closesAt !== null ? `Vote by ${formatUtc(win.closesAt, now)}` : 'Voting is open';
  if (win.state === 'upcoming') return win.opensAt !== null ? `Voting isn't open yet. Opens ${formatUtc(win.opensAt, now)}` : "Voting isn't open yet.";
  return 'Closed';
}

/** Short navigation badge: null when open, 'Closed' or 'Opens Oct 5'. */
export function windowBadge(win) {
  if (win.state === 'closed') return 'Closed';
  if (win.state === 'upcoming') {
    if (win.opensAt === null) return 'Not open';
    const d = new Date(win.opensAt);
    return `Opens ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  return null;
}

/**
 * Turn event occurrences + form windows into one dated list.
 * @param {{events?: Array<{event:object, occurrence:object}>, forms?: Array<{key,label,href,closesAt,opensAt,state}>}} input
 * Entries: { id, kind: 'event'|'deadline'|'opens', label, at, href, estimated }
 *  - event: next start (or end when already running)
 *  - deadline: an open form's close time ("Swordland vote closes")
 *  - opens: a scheduled form's opening
 */
export function buildDeadlineEntries({ events = [], forms = [], cycles = [] }, now = Date.now()) {
  const out = [];
  for (const { event, occurrence } of events) {
    if (!event || !occurrence || event.kind === 'bear_hunt') continue;
    const start = toMs(occurrence.starts_at);
    const end = toMs(occurrence.ends_at);
    if (start === null) continue;
    const running = start <= now && end !== null && end > now;
    const at = running ? end : start;
    if (at <= now) continue;
    out.push({
      id: `event:${event.slug || event.title}`,
      kind: 'event',
      label: running ? `${event.title} ends` : event.title,
      at,
      href: event.slug ? `/events/${event.slug}` : '/events',
      estimated: Boolean(event.is_default),
    });
  }
  for (const form of forms) {
    const vote = form.kind === 'event' || form.kind === undefined;
    const name = form.shortLabel || form.label;
    if (form.state === 'open' && form.closesAt !== null && form.closesAt !== undefined && form.closesAt > now) {
      out.push({ id: `deadline:${form.key}`, kind: 'deadline', label: vote ? `${name} vote closes` : `${name} closes`, at: form.closesAt, href: form.href, formKey: form.key, estimated: false });
    } else if (form.state === 'upcoming' && form.opensAt !== null && form.opensAt !== undefined && form.opensAt > now) {
      out.push({ id: `opens:${form.key}`, kind: 'opens', label: vote ? `${name} vote opens` : `${name} opens`, at: form.opensAt, href: form.href, formKey: form.key, estimated: false });
    }
  }
  // Cycle end ("KvK cycle ends"): shown for a cycle whose forms have no window of their own.
  for (const cycle of cycles) {
    if (cycle?.at > now) out.push({ id: `cycle:${cycle.id}`, kind: 'deadline', label: `${cycle.title} cycle ends`, at: cycle.at, href: cycle.href || '/forms', estimated: false });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Ticker: next `limit` future dated items (events + deadlines); empty array hides the bar. */
export function selectTickerItems(entries, now = Date.now(), limit = 3) {
  const seen = new Set();
  const items = [];
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    if (entry.kind === 'opens' || !(entry.at > now) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    items.push(entry);
    if (items.length >= limit) break;
  }
  return items;
}

/** Decorate entries for the dashboard list with countdown text + due-soon flag. */
export function describeEntry(entry, now = Date.now()) {
  const remaining = entry.at - now;
  return {
    ...entry,
    remainingMs: remaining,
    countdown: formatCountdown(remaining),
    dueSoon: isDueSoon(entry.at, now),
    // Deadlines due today (within 24h) are spelled out in hours and minutes.
    preciseToday: entry.kind === 'deadline' && remaining > 0 && remaining < DAY,
  };
}
