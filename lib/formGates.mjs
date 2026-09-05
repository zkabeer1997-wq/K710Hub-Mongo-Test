import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

// Mirrors MusterHall.jsx's station keys - the single source of truth for
// which forms can be gated and what an admin sees them labeled as.
export const FORM_GATE_KEYS = ['lead', 'joiner', 'prep', 'dragon', 'noble', 'requests'];

export const FORM_GATE_LABELS = {
  lead: 'Player Profile',
  joiner: 'KvK Availability',
  prep: 'KvK Prep',
  dragon: 'Flamedragon Tyrant',
  noble: 'Noble Advisor Schedule',
  requests: 'Website Requests',
};

const DEFAULT_GATES = Object.fromEntries(
  FORM_GATE_KEYS.map((key) => [key, { form_key: key, is_open: true, message: '' }]),
);

export async function getFormGates() {
  try {
    const coll = await getCollection(COLLECTIONS.FORM_GATES);
    const data = await coll.find({}).project({ form_key: 1, is_open: 1, message: 1, _id: 0 }).toArray();
    const gates = { ...DEFAULT_GATES };
    for (const row of data || []) {
      if (FORM_GATE_KEYS.includes(row.form_key)) {
        gates[row.form_key] = row;
      }
    }
    return gates;
  } catch {
    return DEFAULT_GATES;
  }
}

export async function getFormGate(formKey) {
  const gates = await getFormGates();
  return gates[formKey] || { form_key: formKey, is_open: true, message: '' };
}
