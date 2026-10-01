// Calendar (.ics) events for the daily Bear Hunt schedule, one recurring
// VEVENT per alliance hunt time. RFC 5545: FREQ=DAILY at a fixed UTC time.
import { huntsFromAlliances } from './bearHuntSchedule.js';

export function nextDailyOccurrence(utcHHMM, now = Date.now()) {
  const date = new Date(now);
  const [h, m] = utcHHMM.split(':').map(Number);
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, 0));
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function bearHuntIcsEvents(alliances, { tag = null, now = Date.now() } = {}) {
  const wanted = tag ? String(tag).toUpperCase() : null;
  const scoped = wanted ? alliances.filter(a => String(a.tag).toUpperCase() === wanted) : alliances;
  return huntsFromAlliances(scoped).map(hunt => ({
    uid: `bear-hunt-${hunt.band}-${hunt.utc.replace(':', '')}@k710hub`,
    start: nextDailyOccurrence(hunt.utc, now),
    rrule: 'FREQ=DAILY',
    summary: `Bear Hunt — ${hunt.band} (${hunt.utc} UTC)`,
    description: `Kingdom 710 ${hunt.band} alliance Bear Hunt, daily at ${hunt.utc} UTC.`,
  }));
}
