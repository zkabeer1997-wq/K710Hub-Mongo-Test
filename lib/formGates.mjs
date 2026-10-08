// Client-safe constants only. Do NOT import mongo here — this module is
// imported by client components (admin form-gates page).

export const STANDING_GATE_KEYS = ['lead', 'joiner', 'prep', 'dragon', 'noble', 'appointments', 'requests'];
// Per-event participation forms. Their gate rows also carry opens_at / closes_at
// / cycle_id, and they stay shut until an admin schedules a window.
// The Castle Battle gate was removed; stale form_gates rows for it are ignored.
export const EVENT_GATE_KEYS = ['swordland', 'tri-alliance'];
export const FORM_GATE_KEYS = [...STANDING_GATE_KEYS, ...EVENT_GATE_KEYS];
// Every gate can carry opens_at / closes_at / cycle_id. Standing forms with no window
// stay manual open/close; with a window they open and auto-close on schedule.
export const WINDOWED_GATE_KEYS = FORM_GATE_KEYS;
// Forms that belong to each cycle type (admin event control).
// 'appointments' is no longer a member form: the KvK Prep & Appointments form ('prep') carries both the
// ranking answers and the availability. The 'appointments' gate row is kept only to hold the schedule
// cycle id (and old data); it is not listed here, so it has no open/close controls.
export const KVK_FORM_KEYS = ['lead', 'joiner', 'prep'];
// The event vote forms are not tied to a KvK / Flamedragon cycle. Each has
// its own "round": starting a new round gives the gate a fresh cycle_id, so
// members vote again and the old votes stay on file.
export const VOTE_FORM_KEYS = EVENT_GATE_KEYS;

/** Fresh round identity for a vote form: id like "r-1760000000000" plus a readable label. */
export function newRound(now = Date.now(), label = '') {
  const clean = String(label || '').trim().slice(0, 60);
  const fallback = `Round of ${new Date(now).toISOString().slice(0, 10)}`;
  return { cycle_id: `r-${now}`, round_label: clean || fallback };
}

export const FLAMEDRAGON_FORM_KEYS = ['dragon', 'noble'];

export const FORM_GATE_LABELS = {
  lead: 'Power Profile',
  joiner: 'KvK Availability',
  prep: 'KvK Prep & Appointments',
  dragon: 'Flamedragon Tyrant',
  noble: 'Noble Advisor Schedule',
  appointments: 'KvK schedule (retired form)',
  requests: 'Website Requests',
  swordland: 'Swordland Summit vote',
  'tri-alliance': 'Tri-Alliance Clash vote',
};

export const DEFAULT_GATES = Object.fromEntries(
  FORM_GATE_KEYS.map((key) => [key, { form_key: key, is_open: true, message: '', opens_at: null, closes_at: null, cycle_id: 'current', round_label: '' }]),
);
