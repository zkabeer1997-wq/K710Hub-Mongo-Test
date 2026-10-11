// Backpack scan data saved with the KvK Prep and Noble Advisor records. Pure: shared by the forms, the API routes and
// the admin pages. The IMAGE is never part of this; only structured numbers. The scheduler never reads any of this for
// ranking: it keeps ranking by the typed/filled fields. These are for admins to see what was scanned.
import { MAX_QUANTITY } from './scan/kinds/backpackInventory/gameData.mjs';

/** Same ceiling as the Noble Advisor days check (100000 days). */
export const MAX_BACKPACK_MINUTES = 100000 * 1440;
export const SPEEDUP_MINUTE_KEYS = ['construction', 'research', 'troop', 'general'];
export const BACKPACK_FIELD_NOTE = 'from your backpack scan';
export const DIFF_HINT_RATIO = 0.1;
export const MAX_SCAN_CORRECTIONS = 80;

/** Fields that can carry a scan source, per form. */
export const PREP_SCAN_FIELDS = ['ttg_used', 'tg_used', 'tg_dust', 'research_speedup_days', 'troop_speedup_days'];
export const NOBLE_SCAN_FIELDS = ['troop_speedup_days'];

/** Days for a form box: up to 2 decimals, trailing zeros dropped ("2.5", "4.23", "12"). */
export function formatDays(days) {
  if (!Number.isFinite(days) || days < 0) return '';
  return String(Math.round(days * 100) / 100);
}
/** Whole numbers for a form box. */
export function formatCount(n) {
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n)) : '';
}
/** "4.2 days" for display (1 decimal), plus the exact minutes beside it where shown. */
export function displayDays(days) {
  return Number.isFinite(days) ? (Math.round(days * 10) / 10).toFixed(1) : '';
}

const nullableCount = (v, max) => {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) return { ok: false };
  return { ok: true, value: v };
};

/**
 * Validate a client snapshot. Returns { snapshot } (or { snapshot: null } when nothing was sent) or { error }.
 * Numbers must be finite, non-negative whole numbers within sane limits; unknown keys are dropped.
 */
export function sanitizeBackpackScan(input, now = new Date()) {
  if (input === null || input === undefined || input === '') return { snapshot: null };
  const bad = { error: 'The backpack scan numbers do not look right. Scan again, or type the numbers yourself.' };
  if (typeof input !== 'object' || Array.isArray(input)) return bad;
  const when = new Date(input.scanned_at);
  if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime() + 5 * 60 * 1000 || when.getTime() < now.getTime() - 400 * 24 * 3600 * 1000) return bad;
  const snapshot = { scanned_at: when, engine_version: typeof input.engine_version === 'string' ? input.engine_version.slice(0, 40) : '' };
  for (const key of ['tg', 'ttg', 'tg_dust']) {
    const c = nullableCount(input[key], MAX_QUANTITY);
    if (!c.ok) return bad;
    snapshot[key] = c.value;
  }
  const minutes = input.speedup_minutes;
  if (!minutes || typeof minutes !== 'object' || Array.isArray(minutes)) return bad;
  snapshot.speedup_minutes = {};
  for (const key of SPEEDUP_MINUTE_KEYS) {
    const c = nullableCount(minutes[key], MAX_BACKPACK_MINUTES);
    if (!c.ok) return bad;
    snapshot.speedup_minutes[key] = c.value;
  }
  return { snapshot };
}

/** { field: 'scan' | 'typed' } for the allowed fields only. */
export function sanitizeFieldSources(input, allowed) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const key of allowed) if (input[key] === 'scan' || input[key] === 'typed') out[key] = input[key];
  return out;
}

/** One line for admins: what the scan read (the member's backpack, not what they plan to use). */
export function describeBackpackSnapshot(snapshot) {
  if (!snapshot) return '';
  const n = (v) => (v === null || v === undefined ? 'not scanned' : Number(v).toLocaleString('en-US'));
  const m = snapshot.speedup_minutes || {};
  const date = new Date(snapshot.scanned_at);
  const when = Number.isNaN(date.getTime()) ? '' : `Scanned ${date.toISOString().slice(0, 10)}: `;
  const days = (v) => (v === null || v === undefined ? 'not scanned' : `${Math.round((v / 1440) * 100) / 100} days (${Number(v).toLocaleString('en-US')} min)`);
  const research = m.research === null || m.research === undefined ? null : m.research + (m.general || 0);
  return `${when}TG ${n(snapshot.tg)}, TTG ${n(snapshot.ttg)}, TG Dust ${n(snapshot.tg_dust)}; research incl. general ${days(research)} (general ${n(m.general)} min); troop ${days(m.troop)}; construction ${n(m.construction)} min`;
}

/** What a record says it was scanned: { scanned: boolean, snapshot } from a stored row. */
export function scanInfoOf(row) {
  const snapshot = row && typeof row.backpack_scan === 'object' ? row.backpack_scan : null;
  return { snapshot: snapshot || null, sources: (row && row.backpack_sources) || {} };
}

const numberOf = (v) => {
  const text = String(v ?? '').replace(/[,\s+]/g, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/** The scanned number a typed field should be compared with, or null when there is none. */
export function scannedValueFor(field, snapshot) {
  if (!snapshot) return null;
  const m = snapshot.speedup_minutes || {};
  const sum = (a) => (m[a] === null || m[a] === undefined ? null : m[a]);
  // Owner rule: general speedups are added to research days only; troop days are troop speedups only.
  const researchTotal = () => {
    const base = sum('research'); const gen = sum('general');
    return base === null ? null : (base + (gen || 0)) / 1440;
  };
  switch (field) {
    case 'ttg_used': return snapshot.ttg ?? null;
    case 'tg_used': return snapshot.tg ?? null;
    case 'tg_dust': return snapshot.tg_dust ?? null;
    case 'research_speedup_days': return researchTotal();
    case 'troop_speedup_days': return sum('troop') === null ? null : sum('troop') / 1440;
    default: return null;
  }
}

/**
 * Admin hint: the typed number differs from the scanned one by more than 10%. A member may plan to use LESS than they own,
 * so this is a hint, never an error. Returns null when there is nothing to compare or the numbers agree.
 */
export function scanDifference(field, typedValue, snapshot) {
  const scanned = scannedValueFor(field, snapshot);
  const typed = numberOf(typedValue);
  if (scanned === null || typed === null) return null;
  const base = Math.max(Math.abs(scanned), 1e-9);
  const ratio = Math.abs(typed - scanned) / base;
  if (scanned === 0 && typed === 0) return null;
  if (ratio <= DIFF_HINT_RATIO) return null;
  return { scanned, typed, ratio };
}
