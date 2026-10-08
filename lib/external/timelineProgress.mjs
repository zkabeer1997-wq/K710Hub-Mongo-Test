// Pure helpers for the live timeline. No React, no I/O. `date` values are
// YYYY-MM-DD; milestones unlock at 00:00 UTC of that day (Monday UTC reset).
import { describeMilestone } from './timelineParse.mjs';

export const DAY_MS = 86_400_000;

export function dayStartMs(date) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** Group milestones that unlock on the same day into chapters, oldest first. */
export function buildChapters(milestones) {
  const byDate = new Map();
  for (const m of milestones || []) {
    const startMs = dayStartMs(m.date);
    if (startMs === null) continue;
    if (!byDate.has(m.date)) byDate.set(m.date, { date: m.date, startMs, items: [] });
    byDate.get(m.date).items.push({ slug: m.slug, ...describeMilestone(m.slug) });
  }
  return [...byDate.values()].sort((a, b) => a.startMs - b.startMs).map((c, i) => ({ ...c, index: i }));
}

/**
 * Where "now" sits: `currentIndex` is the latest chapter already unlocked (-1 if
 * none), `nextIndex` the first one still ahead (-1 if none).
 */
export function locate(chapters, now) {
  let currentIndex = -1;
  for (let i = 0; i < chapters.length; i += 1) if (chapters[i].startMs <= now) currentIndex = i;
  const nextIndex = currentIndex + 1 < chapters.length ? currentIndex + 1 : -1;
  return { currentIndex, nextIndex };
}

export function chapterStatus(index, currentIndex) {
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

/** 0..1 progress of `now` between two instants (clamped). null when not computable. */
export function phaseProgress(startMs, endMs, now) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)));
}

/** "Day N of the kingdom": the creation day is day 1. null before creation / unknown. */
export function kingdomDay(createdDate, now) {
  const start = dayStartMs(createdDate);
  if (start === null || now < start) return null;
  return Math.floor((now - start) / DAY_MS) + 1;
}

export function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days >= 2) return `${days} days`;
  if (days === 1) return `1 day ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function timeAgo(from, now = Date.now()) {
  const ms = from instanceof Date ? from.getTime() : Date.parse(from);
  if (!Number.isFinite(ms)) return '';
  const diff = Math.max(0, now - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}
