import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getFormGate } from './formGates.server.js';
import { windowState, formatUtc } from './deadlines.mjs';
import { gateClosedMessage } from './formGateWindow.mjs';
import { DEFAULT_CYCLE_ID } from './kvkAppointments.mjs';

// Server-only readers shared by the member and admin appointment routes.

/** Gate row + cycle id + window state for the 'appointments' form. */
export async function loadAppointmentGate(now = Date.now()) {
  const gate = await getFormGate('appointments');
  const win = windowState(gate, now);
  const closedMessage = gateClosedMessage(gate, now);
  return {
    gate,
    cycleId: gate.cycle_id || DEFAULT_CYCLE_ID,
    open: win.state === 'open',
    message: closedMessage || (win.closesAt !== null ? `Open until ${formatUtc(win.closesAt, now)}.` : 'Applications are open.'),
    note: gate.message || '',
    closedMessage,
  };
}

export async function isCyclePublished(cycleId) {
  const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_CYCLES);
  const row = await coll.findOne({ cycle_id: cycleId }, { projection: { published: 1, published_at: 1, _id: 0 } });
  return { published: row?.published === true, publishedAt: row?.published_at ? new Date(row.published_at).toISOString() : null };
}

export function iso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function publicApplication(row) {
  return {
    day: row.day, buff: row.buff, tg: row.tg, ttg: row.ttg, speedup_days: row.speedup_days,
    preferred_hours: row.preferred_hours || [], updated_at: iso(row.updated_at),
  };
}

/**
 * Replace the auto-allocated (manual !== true) assignments for one day/buff
 * without ever passing through an "empty" state.
 *
 * Standalone MongoDB cannot run transactions, so instead of deleteMany +
 * insertMany this:
 *   1. ordered-bulkWrites an upsert per new assignment, keyed on the unique
 *      (cycle, day, buff, slot) index, so unchanged rows are touched in place;
 *   2. first removes only the few stale rows that would collide with those
 *      upserts (same member in a different slot, or a slot changing hands) and
 *      restores them if the bulk write fails;
 *   3. only after the upserts succeed, deletes the remaining stale slots.
 * A failure therefore leaves the previous schedule intact.
 *
 * @param {import('mongodb').Collection} coll assignments collection
 * @param {{cycle_id: string, day: number, buff: string}} filter
 * @param {Array<{member_id: string, slot: string, score?: number}>} assignments
 * @param {Map<string, string>} names member_id -> display name
 */
export async function replaceAutoAssignments(coll, filter, assignments, names = new Map(), now = new Date()) {
  const autoFilter = { ...filter, manual: { $ne: true } };
  const existing = await coll.find(autoFilter).toArray();
  const targetBySlot = new Map(assignments.map((a) => [a.slot, a]));
  const targetByMember = new Map(assignments.map((a) => [String(a.member_id), a]));

  const conflicting = existing.filter((row) => {
    const bySlot = targetBySlot.get(row.slot);
    if (bySlot && String(bySlot.member_id) === String(row.member_id)) return false; // unchanged: updated in place
    return Boolean(bySlot) || targetByMember.has(String(row.member_id));
  });

  if (conflicting.length) {
    await coll.deleteMany({ _id: { $in: conflicting.map((row) => row._id) } });
  }

  try {
    if (assignments.length) {
      await coll.bulkWrite(
        assignments.map((a) => ({
          updateOne: {
            filter: { ...filter, slot: a.slot },
            update: {
              $set: {
                member_id: String(a.member_id),
                name: names.get(String(a.member_id)) || '',
                score: a.score,
                manual: false,
                updated_at: now,
              },
              $setOnInsert: { created_at: now },
            },
            upsert: true,
          },
        })),
        { ordered: true }
      );
    }
  } catch (error) {
    if (conflicting.length) {
      try {
        await coll.insertMany(conflicting, { ordered: false });
      } catch (restoreError) {
        console.error('kvk auto-allocate could not restore previous slots', restoreError);
      }
    }
    throw error;
  }

  await coll.deleteMany({ ...autoFilter, slot: { $nin: assignments.map((a) => a.slot) } });
}
