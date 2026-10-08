import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChapters, locate, chapterStatus, phaseProgress, kingdomDay, formatRemaining, timeAgo, DAY_MS } from '../lib/external/timelineProgress.mjs';

const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const milestones = [
  { slug: 'gen6-pets', date: '2026-07-20' },
  { slug: 'gen6-heroes', date: '2026-07-20' },
  { slug: 'first-flamedragon-tyrant-battle', date: '2026-08-30' },
  { slug: 'gen7-heroes', date: '2026-10-12' },
  { slug: 'broken', date: 'nope' },
];

describe('live timeline math (pure)', () => {
  const chapters = buildChapters(milestones);
  it('groups same-day unlocks into chapters, oldest first, skipping bad dates', () => {
    assert.equal(chapters.length, 3);
    assert.equal(chapters[0].items.length, 2);
    assert.deepEqual(chapters.map((c) => c.index), [0, 1, 2]);
  });
  it('locates the current chapter at different instants', () => {
    assert.deepEqual(locate(chapters, ms('2026-07-01')), { currentIndex: -1, nextIndex: 0 });
    assert.deepEqual(locate(chapters, ms('2026-07-20')), { currentIndex: 0, nextIndex: 1 });
    assert.deepEqual(locate(chapters, ms('2026-10-08') + 3600e3), { currentIndex: 1, nextIndex: 2 });
    assert.deepEqual(locate(chapters, ms('2027-01-01')), { currentIndex: 2, nextIndex: -1 });
    assert.deepEqual(locate([], 1), { currentIndex: -1, nextIndex: -1 });
  });
  it('classifies status', () => {
    assert.deepEqual([0, 1, 2].map((i) => chapterStatus(i, 1)), ['done', 'current', 'upcoming']);
  });
  it('computes phase progress, clamped, with bad input -> null', () => {
    const a = ms('2026-08-30');
    const b = ms('2026-10-12');
    assert.equal(phaseProgress(a, b, a), 0);
    assert.equal(phaseProgress(a, b, b), 1);
    assert.equal(phaseProgress(a, b, a - DAY_MS), 0);
    assert.equal(phaseProgress(a, b, b + DAY_MS), 1);
    assert.ok(Math.abs(phaseProgress(a, b, (a + b) / 2) - 0.5) < 1e-9);
    assert.equal(phaseProgress(b, a, a), null);
    assert.equal(phaseProgress(NaN, b, a), null);
  });
  it('counts the kingdom day (open day is day 1)', () => {
    assert.equal(kingdomDay('2025-07-26', ms('2025-07-26')), 1);
    assert.equal(kingdomDay('2025-07-26', ms('2025-07-27') + 5), 2);
    assert.equal(kingdomDay('2025-07-26', ms('2025-07-25')), null);
    assert.equal(kingdomDay(null, Date.now()), null);
    assert.equal(kingdomDay('2025-07-26', ms('2026-10-08')), 440);
  });
  it('formats remaining time and relative age', () => {
    assert.equal(formatRemaining(0), 'now');
    assert.equal(formatRemaining(5 * DAY_MS), '5 days');
    assert.equal(formatRemaining(DAY_MS + 3 * 3600e3), '1 day 3h');
    assert.equal(formatRemaining(5 * 3600e3 + 12 * 60e3), '5h 12m');
    assert.equal(formatRemaining(30e3), '1m');
    const now = Date.now();
    assert.equal(timeAgo(new Date(now - 10e3), now), 'just now');
    assert.equal(timeAgo(new Date(now - 5 * 60e3), now), '5 min ago');
    assert.equal(timeAgo(new Date(now - 3 * 3600e3), now), '3 h ago');
    assert.equal(timeAgo(new Date(now - 72 * 3600e3), now), '3 days ago');
    assert.equal(timeAgo('garbage', now), '');
  });
});
