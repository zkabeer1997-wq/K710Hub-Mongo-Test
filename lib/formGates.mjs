// Client-safe constants only. Do NOT import mongo here — this module is
// imported by client components (admin form-gates page).

export const STANDING_GATE_KEYS = ['lead', 'joiner', 'prep', 'dragon', 'noble', 'appointments', 'requests'];
// Per-event participation forms. Their gate rows also carry opens_at / closes_at
// / cycle_id, and they stay shut until an admin schedules a window.
export const EVENT_GATE_KEYS = ['swordland', 'tri-alliance', 'castle-battle'];
export const FORM_GATE_KEYS = [...STANDING_GATE_KEYS, ...EVENT_GATE_KEYS];
// Every gate can carry opens_at / closes_at / cycle_id. Standing forms with no window
// stay manual open/close; with a window they open and auto-close on schedule.
export const WINDOWED_GATE_KEYS = FORM_GATE_KEYS;
// Forms that belong to each cycle type (admin event control).
export const KVK_FORM_KEYS = ['lead', 'joiner', 'prep', 'appointments'];
export const FLAMEDRAGON_FORM_KEYS = ['dragon', 'noble'];

export const FORM_GATE_LABELS = {
  lead: 'Power Profile',
  joiner: 'KvK Availability',
  prep: 'KvK Prep',
  dragon: 'Flamedragon Tyrant',
  noble: 'Noble Advisor Schedule',
  appointments: 'KvK Appointments',
  requests: 'Website Requests',
  swordland: 'Swordland Showdown vote',
  'tri-alliance': 'Tri-Alliance Clash vote',
  'castle-battle': 'Castle Battle vote',
};

export const DEFAULT_GATES = Object.fromEntries(
  FORM_GATE_KEYS.map((key) => [key, { form_key: key, is_open: true, message: '', opens_at: null, closes_at: null, cycle_id: 'current' }]),
);
