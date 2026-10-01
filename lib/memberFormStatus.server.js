import { unstable_rethrow } from './rethrowNext.js';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getFormGates, isoOrNull } from './formGates.server.js';
import { computeFormStatuses } from './memberForms.mjs';
import { EVENT_FORMS } from './eventForms.mjs';
import { upcomingEventSeries } from './eventRecurrence.mjs';
import { mergeDefaultEvents } from './defaultEvents.mjs';
import { buildDeadlineEntries } from './deadlines.mjs';

// Server-only readers behind /api/member-form-status and /api/deadlines.
// Every read degrades to "nothing on file" / defaults when Mongo is unavailable.

async function lastUpdated(collectionName, filter) {
  const coll = await getCollection(collectionName);
  const row = await coll.findOne(filter, { projection: { updated_at: 1, created_at: 1, _id: 0 }, sort: { updated_at: -1 } });
  return row ? isoOrNull(row.updated_at || row.created_at) || new Date(0).toISOString() : null;
}

/** ISO last-updated per form key for this member (null = no entry on file). */
export async function getMemberSubmissionTimes(memberId, gates) {
  const id = String(memberId || '').trim();
  const empty = {};
  if (!id) return empty;
  const safe = async (fn) => {
    try { return await fn(); } catch (error) { unstable_rethrow(error); return null; }
  };
  const [lead, joiner, prep, dragon, noble, appointments, ...events] = await Promise.all([
    safe(() => lastUpdated(COLLECTIONS.POWER_PROFILES, { member_id: id })),
    safe(() => lastUpdated(COLLECTIONS.SUBMISSIONS, { member_id: id, availability: { $exists: true, $nin: [null, ''] } })),
    safe(() => lastUpdated(COLLECTIONS.PREP_BACKPACK, { member_id: id })),
    safe(() => lastUpdated(COLLECTIONS.FLAMEDRAGON_FORMS, { member_id: id })),
    safe(() => lastUpdated(COLLECTIONS.NOBLE_ADVISOR, { member_id: id })),
    safe(() => lastUpdated(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS, { member_id: id, cycle_id: gates?.appointments?.cycle_id || 'current' })),
    ...EVENT_FORMS.map((form) => safe(() => lastUpdated(COLLECTIONS.EVENT_PARTICIPATION, {
      member_id: id, form_id: form.slug, cycle_id: gates?.[form.gateKey]?.cycle_id || 'current',
    }))),
  ]);
  const out = { lead, joiner, prep, dragon, noble, appointments };
  EVENT_FORMS.forEach((form, i) => { out[form.gateKey] = events[i]; });
  return out;
}

export async function getMemberFormStatuses(memberId, now = Date.now()) {
  const gates = await getFormGates();
  const submissions = await getMemberSubmissionTimes(memberId, gates);
  return computeFormStatuses({ gates, submissions, now });
}

/** Published events (defaults merged in) as next-occurrence entries, no Bear Hunts. */
async function loadEventOccurrences(now) {
  let stored = [];
  try {
    const coll = await getCollection(COLLECTIONS.EVENTS);
    stored = await coll.find({}).project({
      published: 1, slug: 1, title: 1, kind: 1, starts_at: 1, ends_at: 1,
      recurrence_frequency: 1, recurrence_interval: 1, recurrence_until: 1, _id: 0,
    }).toArray();
  } catch (error) {
    unstable_rethrow(error);
    stored = [];
  }
  const merged = mergeDefaultEvents(stored, []).filter((event) => event.published && event.kind !== 'bear_hunt');
  return upcomingEventSeries(merged, now);
}

/** All dated entries (events + form deadlines/openings) sorted by time. */
export async function getDeadlineEntries(now = Date.now()) {
  const [events, gates] = await Promise.all([loadEventOccurrences(now), getFormGates()]);
  const forms = computeFormStatuses({ gates, now }).filter((f) => f.kind === 'event');
  return buildDeadlineEntries({ events, forms }, now);
}
