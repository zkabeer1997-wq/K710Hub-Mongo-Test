import { unstable_rethrow } from './rethrowNext.js';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { FORM_GATE_KEYS, DEFAULT_GATES } from './formGates.mjs';
import { gateClosedMessage } from './formGateWindow.mjs';

// Server-only form gate readers (uses MongoDB).

export function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getFormGates() {
  try {
    const coll = await getCollection(COLLECTIONS.FORM_GATES);
    const data = await coll
      .find({})
      .project({ form_key: 1, is_open: 1, message: 1, opens_at: 1, closes_at: 1, cycle_id: 1, round_label: 1, _id: 0 })
      .toArray();
    const gates = { ...DEFAULT_GATES };
    for (const row of data || []) {
      if (FORM_GATE_KEYS.includes(row.form_key)) {
        gates[row.form_key] = {
          ...DEFAULT_GATES[row.form_key],
          ...row,
          opens_at: isoOrNull(row.opens_at),
          closes_at: isoOrNull(row.closes_at),
          cycle_id: row.cycle_id || DEFAULT_GATES[row.form_key].cycle_id,
        };
      }
    }
    return gates;
  } catch (error) {
    unstable_rethrow(error);
    return { ...DEFAULT_GATES };
  }
}

export async function getFormGate(formKey) {
  const gates = await getFormGates();
  return gates[formKey] || { form_key: formKey, is_open: true, message: '' };
}

/**
 * Server-side enforcement for member submit routes. A gate with no window is a
 * manual open/close switch; with opens_at / closes_at it opens and closes itself.
 * @returns {Promise<{open: true, gate: object}|{open: false, gate: object, error: string}>}
 */
export async function checkFormOpen(formKey, now = Date.now()) {
  const gate = await getFormGate(formKey);
  const error = gateClosedMessage(gate, now);
  return error ? { open: false, gate, error } : { open: true, gate };
}
