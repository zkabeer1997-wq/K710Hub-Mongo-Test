import { createAdminSupabaseClient } from './adminSupabase';

// Mirrors MusterHall.jsx's station keys - the single source of truth for
// which forms can be gated and what an admin sees them labeled as. Only
// leaf forms are gated here, not the KvK Forms / Flamedragon Tyrant Forms
// category links that lead to them - those never carry their own closed
// state (see the `ungated` stations in MusterHall.jsx's `top` variant).
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

// Reads all gate rows in one query and returns a map keyed by form_key,
// filled in with open/no-message defaults for any row not yet in the
// table (so a missing table row never accidentally closes a form).
export async function getFormGates() {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.from('form_gates').select('form_key, is_open, message');
    if (error) throw error;
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
