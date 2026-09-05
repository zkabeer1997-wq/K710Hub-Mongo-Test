// Client-safe constants only. Do NOT import mongo here — this module is
// imported by client components (admin form-gates page).

export const FORM_GATE_KEYS = ['lead', 'joiner', 'prep', 'dragon', 'noble', 'requests'];

export const FORM_GATE_LABELS = {
  lead: 'Player Profile',
  joiner: 'KvK Availability',
  prep: 'KvK Prep',
  dragon: 'Flamedragon Tyrant',
  noble: 'Noble Advisor Schedule',
  requests: 'Website Requests',
};

export const DEFAULT_GATES = Object.fromEntries(
  FORM_GATE_KEYS.map((key) => [key, { form_key: key, is_open: true, message: '' }]),
);
