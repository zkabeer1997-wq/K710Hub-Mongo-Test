// Client-safe constants only. Do NOT import mongo here — this module is
// imported by client components (admin form-gates page).

export const STANDING_GATE_KEYS = ['lead', 'joiner', 'prep', 'dragon', 'noble', 'requests'];
// Per-event participation forms. Their gate rows also carry opens_at / closes_at
// / cycle_id, and they stay shut until an admin schedules a window.
export const EVENT_GATE_KEYS = ['swordland', 'tri-alliance', 'castle-battle'];
export const FORM_GATE_KEYS = [...STANDING_GATE_KEYS, ...EVENT_GATE_KEYS];

export const FORM_GATE_LABELS = {
  lead: 'Power Profile',
  joiner: 'KvK Availability',
  prep: 'KvK Prep',
  dragon: 'Flamedragon Tyrant',
  noble: 'Noble Advisor Schedule',
  requests: 'Website Requests',
  swordland: 'Swordland Showdown vote',
  'tri-alliance': 'Tri-Alliance Clash vote',
  'castle-battle': 'Castle Battle vote',
};

export const DEFAULT_GATES = Object.fromEntries(
  FORM_GATE_KEYS.map((key) => [key, { form_key: key, is_open: true, message: '', opens_at: null, closes_at: null, cycle_id: 'current' }]),
);
