// Built-in recurring events. They are computed, never written to the
// database, so a fresh install lists them immediately. An admin overrides one
// by creating an event with the same slug in Admin > Events (publishing it
// with new times, or leaving it as a draft to hide it).
import { validateBearTimes } from './bearHuntSchedule.js';


// Cadences for the kingdom-wide defaults. The anchors are the first occurrence
// of the repeating series; leadership should confirm them (and override via
// Admin > Events) because the game schedule is not read from any live source.
export const DEFAULT_KINGDOM_EVENTS = [
  {
    slug: 'kvk-cycle', title: 'KvK cycle', kind: 'kvk',
    description: 'Kingdom vs Kingdom opens every four weeks. Preparation phase first, then the battle phase.',
    starts_at: '2026-09-07T00:00:00.000Z', ends_at: '2026-09-11T00:00:00.000Z',
    recurrence_frequency: 'weekly', recurrence_interval: 4,
  },
  {
    slug: 'swordland-showdown', title: 'Swordland Summit', kind: 'swordland',
    description: 'Swordland territory battle, every two weeks. Alliances publish their own legion times under Alliance events.',
    starts_at: '2026-09-05T12:00:00.000Z', ends_at: '2026-09-05T14:00:00.000Z',
    recurrence_frequency: 'weekly', recurrence_interval: 2,
  },
  {
    slug: 'flamedragon-tyrant', title: 'Flamedragon Tyrant', kind: 'custom',
    description: 'Flamedragon Tyrant boss event, every two weeks. Submit the Flamedragon Tyrant form before it opens.',
    starts_at: '2026-09-06T14:00:00.000Z', ends_at: '2026-09-06T16:00:00.000Z',
    recurrence_frequency: 'weekly', recurrence_interval: 2,
  },
];

// Midnight-anchored first occurrence for a daily "HH:MM" UTC hunt. A fixed past
// anchor keeps the ICS and the countdown deterministic.
const BEAR_ANCHOR = '2026-01-01';

export function defaultBearHuntEvents(alliances = []) {
  return alliances.filter(a => a && a.active !== false && a.tag).flatMap(alliance => {
    const { times } = validateBearTimes(alliance.bear_times_utc || []);
    return (times || []).map(time => ({
      slug: `bear-hunt-${String(alliance.tag).toLowerCase()}-${time.replace(':', '')}`,
      title: `Bear Hunt · ${alliance.tag} · ${time} UTC`,
      kind: 'bear_hunt',
      description: `Daily ${alliance.name || alliance.tag} Bear Hunt at ${time} UTC.`,
      starts_at: `${BEAR_ANCHOR}T${time}:00.000Z`,
      ends_at: null,
      recurrence_frequency: 'daily',
      recurrence_interval: 1,
      alliance_tag: alliance.tag,
    }));
  });
}

export function defaultEvents(alliances = []) {
  return [...defaultBearHuntEvents(alliances), ...DEFAULT_KINGDOM_EVENTS].map(event => ({
    body_md: '', recurrence_until: null, published: true, is_default: true, ...event,
  }));
}

// Defaults first overridden by any stored event sharing the slug (drafts hide
// the default). Stored events are returned untouched, then remaining defaults.
export function mergeDefaultEvents(stored = [], alliances = []) {
  const bySlug = new Set(stored.map(event => event.slug));
  return [...stored, ...defaultEvents(alliances).filter(event => !bySlug.has(event.slug))];
}

export function findDefaultEvent(slug, alliances = []) {
  return defaultEvents(alliances).find(event => event.slug === slug) || null;
}


