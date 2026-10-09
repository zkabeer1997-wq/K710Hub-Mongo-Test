// Pure helpers for the side rails of the alliance page (alliance switcher, section links, next Bear Hunt
// countdown, KvK record). No React, Next or Mongo imports so they are unit tested.
import { orderAlliancesForLanding } from './alliances.mjs';
import { validateBearTimes } from './bearHuntSchedule.js';

const DAY_MS = 86400000;

/** Section links of the alliance page. `id` is the real section id; `labelKey` an i18n key. */
export const RAIL_ANCHORS = Object.freeze([
  { id: 'al-overview', labelKey: 'alliances.rail.overview' },
  { id: 'al-leadership', labelKey: 'alliances.panel.leadership' },
  { id: 'al-bear', labelKey: 'alliances.panel.bearHunt' },
  { id: 'al-join', labelKey: 'alliances.panel.join' },
]);

/** One chip per active alliance in landing order; the current one is marked. Never invents alliances. */
export function railChips(alliances = [], currentTag = '') {
  const current = String(currentTag || '').toUpperCase();
  return orderAlliancesForLanding(alliances).map((a) => ({
    tag: String(a.tag),
    name: String(a.name || a.tag),
    href: `/alliances/${String(a.tag).toLowerCase()}`,
    current: String(a.tag).toUpperCase() === current,
  }));
}

/**
 * The next Bear Hunt of an alliance and the milliseconds until it starts (UTC clock, wraps to tomorrow).
 * A hunt that started within the current minute counts as "now" (0 ms), like BearTimes' highlight.
 * @returns {{time:string, index:number, ms:number}|null} index is the 0-based position among the sorted times
 */
export function nextHuntCountdown(times = [], now = Date.now()) {
  const { times: sorted } = validateBearTimes(Array.isArray(times) ? times : []);
  if (!sorted || !sorted.length) return null;
  const d = new Date(now);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let best = null;
  sorted.forEach((time, index) => {
    const [h, m] = time.split(':').map(Number);
    let diff = dayStart + (h * 60 + m) * 60000 - now;
    if (diff <= -60000) diff += DAY_MS;
    if (diff < 0) diff = 0;
    if (!best || diff < best.ms) best = { time, index, ms: diff };
  });
  return best;
}

/** HH:MM:SS (hours may exceed two digits only past 99h, which never happens for a daily hunt). */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Scrollspy choice: a link the visitor just clicked stays active while its section is on screen (the three panels
 * sit side by side, so several are visible at once); otherwise the first anchor in page order that is on screen,
 * else the previous one, else the first.
 */
export function pickActiveAnchor(visibleIds, anchors = RAIL_ANCHORS, previous = '', locked = '') {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  if (locked && visible.has(locked) && anchors.some((a) => a.id === locked)) return locked;
  const hit = anchors.find((a) => visible.has(a.id));
  return hit ? hit.id : (previous || anchors[0]?.id || '');
}

/** What the rail shows of the About page's KvK record, or null (hide the card) when there is nothing to show. */
export function kvkRailData(data) {
  const wins = Number(data?.record?.wins);
  const losses = Number(data?.record?.losses);
  if (!Number.isFinite(wins) || !Number.isFinite(losses) || wins + losses <= 0) return null;
  return { wins, losses, stale: Boolean(data?.stale) };
}
