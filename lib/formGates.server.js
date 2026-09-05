import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { FORM_GATE_KEYS, DEFAULT_GATES } from './formGates.mjs';

// Server-only form gate readers (uses MongoDB).

export async function getFormGates() {
  try {
    const coll = await getCollection(COLLECTIONS.FORM_GATES);
    const data = await coll
      .find({})
      .project({ form_key: 1, is_open: 1, message: 1, _id: 0 })
      .toArray();
    const gates = { ...DEFAULT_GATES };
    for (const row of data || []) {
      if (FORM_GATE_KEYS.includes(row.form_key)) {
        gates[row.form_key] = row;
      }
    }
    return gates;
  } catch {
    return { ...DEFAULT_GATES };
  }
}

export async function getFormGate(formKey) {
  const gates = await getFormGates();
  return gates[formKey] || { form_key: formKey, is_open: true, message: '' };
}
