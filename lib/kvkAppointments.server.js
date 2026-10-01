import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getFormGate } from './formGates.server.js';
import { windowState, windowMessage } from './deadlines.mjs';
import { DEFAULT_CYCLE_ID } from './kvkAppointments.mjs';

// Server-only readers shared by the member and admin appointment routes.

/** Gate row + cycle id + window state for the 'appointments' form. */
export async function loadAppointmentGate(now = Date.now()) {
  const gate = await getFormGate('appointments');
  const win = windowState(gate, now);
  return {
    gate,
    cycleId: gate.cycle_id || DEFAULT_CYCLE_ID,
    open: win.state === 'open',
    message: windowMessage(win, { now }),
    note: gate.message || '',
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
