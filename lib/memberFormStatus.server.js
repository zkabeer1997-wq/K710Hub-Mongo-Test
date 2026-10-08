import { unstable_rethrow } from './rethrowNext.js';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getFormGates, isoOrNull } from './formGates.server.js';
import { computeFormStatuses, withAppointmentsSummary, orderMemberForms, cycleDeadlineEntries } from './memberForms.mjs';
import { EVENT_FORMS } from './eventForms.mjs';
import { upcomingEventSeries } from './eventRecurrence.mjs';
import { mergeDefaultEvents } from './defaultEvents.mjs';
import { buildDeadlineEntries } from './deadlines.mjs';
import { appointmentLine } from './myAppointment.mjs';
import { APPOINTMENT_TYPES } from './kvkAppointments.mjs';
import { loadAppointmentGate, isCyclePublished } from './kvkAppointments.server.js';
import { kvkResultRow, nobleResultRow, resultPagesVisible } from './memberResults.mjs';
import { memberNobleAppointment } from './nobleAppointment.server.js';
import { loadMemberBase } from './memberPrefill.server.js';
import { CYCLE_FORMS, getCurrentEventCycle, loadMemberCycleRecord, EVENT_CYCLE_TYPES } from './eventCycles.server.js';

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
 * (null = not yet) plus the cycle names.
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
  const [lead, states, ...events] = await Promise.all([
    safe(() => lastUpdated(COLLECTIONS.POWER_PROFILES, { member_id: id })),
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
  };
  EVENT_FORMS.forEach((form, i) => { out[form.gateKey] = events[i]; });
  return out;
}

/** Current cycle per type for ordering/deadlines: { kvk: {label,status,start,end}, flamedragon: {...} } (null when unreadable). */
export async function getCycleSummaries() {
  const entries = await Promise.all(EVENT_CYCLE_TYPES.map(async (type) => {
    const cycle = await safe(() => getCurrentEventCycle(type));
    if (!cycle) return [type, null];
    return [type, {
      label: cycle.label || '',
      status: cycle.archived ? 'archived' : cycle.is_current ? 'collecting' : 'ended',
      start: cycle.start_date || null,
      end: cycle.end_date || null,
    }];
  }));
  return Object.fromEntries(entries);
}

/** Statuses already in "what matters now" order, plus the cycle info used to order them. */
export async function getOrderedMemberForms(memberId, now = Date.now()) {
  const [statuses, cycles] = await Promise.all([getMemberFormStatuses(memberId, now), getCycleSummaries()]);
  return { forms: orderMemberForms(statuses, cycles, now), cycles };
}

/** Plain lines for the times leadership published for this member ("Day 1 Construction: Oct 21, 14:30 UTC"). */
export async function memberAppointmentLines(memberId, kvkCycle) {
  const g = await loadAppointmentGate();
  const pub = await isCyclePublished(g.cycleId);
  if (!pub.published) return [];
  const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
  const rows = await coll.find({ member_id: String(memberId), cycle_id: g.cycleId }).toArray();
  return APPOINTMENT_TYPES
    .map((t) => rows.find((r) => Number(r.day) === t.day && r.buff === t.buff))
    .filter(Boolean)
    .map((r) => appointmentLine(r, kvkCycle?.start_date));
}

export async function getMemberFormStatuses(memberId, now = Date.now()) {
  const gates = await getFormGates();
  const id = String(memberId || '').trim();
  const states = await getCycleFormStates(id);
  // A form with no answer in any cycle can still start with the name / alliance we know from elsewhere.
  const base = await safe(() => loadMemberBase(id));
  if (base?.from) {
    for (const key of Object.keys(CYCLE_FORMS)) {
      const own = { joiner: 'your KvK Availability answers', dragon: 'your Flamedragon Tyrant answers' }[key];
      if (base.from !== own && !states[key].updatedAt && !states[key].previousLabel) states[key] = { ...states[key], baseLabel: base.from };
    }
  }
  const submissions = await getMemberSubmissionTimes(memberId, gates, states);
  const kvk = await safe(() => getCurrentEventCycle('kvk'));
  const cycleInfo = { ...states };
  if (base?.from && !submissions.lead) cycleInfo.lead = { baseLabel: base.from };
  // Vote forms have their own rounds; surface the admin's round label.
  EVENT_FORMS.forEach((form) => {
    cycleInfo[form.gateKey] = { cycleLabel: gates?.[form.gateKey]?.round_label || null };
  });
  const statuses = computeFormStatuses({ gates, submissions, cycleInfo, now });
  return withAppointmentsSummary(statuses, await safe(() => memberAppointmentLines(id, kvk)) || []);
}

/** Published events (defaults merged in) as next-occurrence entries, no Bear Hunts. */
async function loadEventOccurrences(now) {
  let stored = [];
  try {
    const coll = await getCollection(COLLECTIONS.EVENTS);
    stored = await coll.find({}).project({
      published: 1, slug: 1, title: 1, kind: 1, starts_at: 1, ends_at: 1,
      recurrence_frequency: 1, recurrence_interval: 1, recurrence_until: 1, recurrence_count: 1, series_id: 1, recurrence_weekdays: 1, exdates: 1, all_day: 1, guide_slug: 1, alliance_tags: 1, _id: 0,
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
  const [events, gates, cycles] = await Promise.all([loadEventOccurrences(now), getFormGates(), getCycleSummaries()]);
  const forms = computeFormStatuses({ gates, now });
  return buildDeadlineEntries({ events, forms, cycles: cycleDeadlineEntries(forms, cycles, now) }, now);
}

/**
 * Result rows (not forms): the KvK "My appointment" row always; the Noble Advisor one only while a
 * Flamedragon cycle is current. Additive field of /api/member-form-status. Reads degrade to the
 * "fill in the form first" wording when Mongo is unavailable.
 */
export async function getMemberResults(memberId, statuses = [], now = Date.now()) {
  const id = String(memberId || '').trim();
  const prep = statuses.find((s) => s.key === 'prep');
  const kvk = await safe(() => getCurrentEventCycle('kvk'));
  const g = await safe(() => loadAppointmentGate(now));
  const pub = g ? await safe(() => isCyclePublished(g.cycleId)) : null;
  let assignments = [];
  if (pub?.published) {
    const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);
    assignments = (await safe(() => coll.find({ member_id: id, cycle_id: g.cycleId }).toArray())) || [];
  }
  const prepLoaded = await safe(() => loadMemberCycleRecord('prep', id));
  const pr = prepLoaded?.record || null;
  const asked = Boolean(pr && (pr.want_construction === 'Yes' || pr.want_research === 'Yes' || pr.want_troop_training === 'Yes'));
  const results = [kvkResultRow({
    prepSaved: Boolean(pr || prep?.submitted), published: pub?.published === true, publishedAt: pub?.publishedAt || null,
    assignments, asked, cycleStart: kvk?.start_date || null,
  })];
  const noble = await safe(() => memberNobleAppointment(id));
  if (noble?.cycle) {
    const assignment = noble.mine ? { slot: noble.mine.slot } : null;
    results.push(nobleResultRow({
      saved: noble.saved, asked: noble.asked, published: noble.published, publishedAt: noble.publishedAt, assignment, cycleStart: noble.cycle.start,
    }));
  }
  return results;
}

/** {kvk, noble}: may members see My appointment / My Noble Advisor appointment right now (owning form open)? */
export async function getResultPagesVisible(now = Date.now()) {
  return resultPagesVisible(await getFormGates(), now);
}
