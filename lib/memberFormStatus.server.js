import { unstable_rethrow } from './rethrowNext.js';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getFormGates, isoOrNull } from './formGates.server.js';
import { computeFormStatuses, withAppointmentProgress } from './memberForms.mjs';
import { EVENT_FORMS } from './eventForms.mjs';
import { upcomingEventSeries } from './eventRecurrence.mjs';
import { mergeDefaultEvents } from './defaultEvents.mjs';
import { buildDeadlineEntries } from './deadlines.mjs';
import { APPOINTMENT_TYPES } from './kvkAppointments.mjs';
import { CYCLE_FORMS, getCurrentEventCycle, loadMemberCycleRecord } from './eventCycles.server.js';

// Server-only readers behind /api/member-form-status and /api/deadlines.
// Every read degrades to "nothing on file" / defaults when Mongo is unavailable.

async function lastUpdated(collectionName, filter) {
  const coll = await getCollection(collectionName);
  const row = await coll.findOne(filter, { projection: { updated_at: 1, created_at: 1, _id: 0 }, sort: { updated_at: -1 } });
  return row ? isoOrNull(row.updated_at || row.created_at) || new Date(0).toISOString() : null;
}

const safe = async (fn) => {
  try { return await fn(); } catch (error) { unstable_rethrow(error); return null; }
};

/**
 * Per-cycle state of the four roster forms: when this member answered in the CURRENT cycle
 * (null = not yet) plus the cycle names. Appointments belong to the current KvK cycle too.
 */
async function getCycleFormStates(memberId) {
  const entries = await Promise.all(Object.keys(CYCLE_FORMS).map(async (key) => {
    const loaded = await safe(() => loadMemberCycleRecord(key, memberId));
    const at = loaded?.record ? isoOrNull(loaded.record.updated_at || loaded.record.created_at) || new Date(0).toISOString() : null;
    return [key, { updatedAt: at, cycleLabel: loaded?.cycle?.label || null, previousLabel: loaded?.previousLabel || null }];
  }));
  return Object.fromEntries(entries);
}

/** ISO last-updated per form key for this member (null = not done; cycle forms: not done THIS cycle). */
export async function getMemberSubmissionTimes(memberId, gates, cycleStates = null) {
  const id = String(memberId || '').trim();
  const empty = {};
  if (!id) return empty;
  const [lead, appointments, states, ...events] = await Promise.all([
    safe(() => lastUpdated(COLLECTIONS.POWER_PROFILES, { member_id: id })),
    safe(() => lastUpdated(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS, { member_id: id, cycle_id: gates?.appointments?.cycle_id || 'current' })),
    cycleStates ? Promise.resolve(cycleStates) : getCycleFormStates(id),
    ...EVENT_FORMS.map((form) => safe(() => lastUpdated(COLLECTIONS.EVENT_PARTICIPATION, {
      member_id: id, form_id: form.slug, cycle_id: gates?.[form.gateKey]?.cycle_id || 'current',
    }))),
  ]);
  const out = {
    lead,
    joiner: states.joiner?.updatedAt || null,
    prep: states.prep?.updatedAt || null,
    dragon: states.dragon?.updatedAt || null,
    noble: states.noble?.updatedAt || null,
    appointments,
  };
  EVENT_FORMS.forEach((form, i) => { out[form.gateKey] = events[i]; });
  return out;
}

export async function getMemberFormStatuses(memberId, now = Date.now()) {
  const gates = await getFormGates();
  const states = await getCycleFormStates(String(memberId || '').trim());
  const submissions = await getMemberSubmissionTimes(memberId, gates, states);
  const kvk = await safe(() => getCurrentEventCycle('kvk'));
  const cycleInfo = { ...states, appointments: { cycleLabel: kvk?.label || null } };
  // Vote forms have their own rounds; surface the admin's round label.
  EVENT_FORMS.forEach((form) => {
    cycleInfo[form.gateKey] = { cycleLabel: gates?.[form.gateKey]?.round_label || null };
  });
  const statuses = computeFormStatuses({ gates, submissions, cycleInfo, now });
  const applied = await safe(async () => {
    const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_APPLICATIONS);
    const rows = await coll.find({ member_id: String(memberId || '').trim(), cycle_id: gates?.appointments?.cycle_id || 'current' }, { projection: { day: 1, buff: 1, _id: 0 } }).toArray();
    return new Set(rows.map((r) => `${r.day}:${r.buff}`)).size;
  });
  return withAppointmentProgress(statuses, applied || 0, APPOINTMENT_TYPES.length);
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
