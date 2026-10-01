// Validation of admin-supplied form windows. Pure, shared by the admin API and tests.
import { toMs } from './deadlines.mjs';

/**
 * @param {{opens_at?: string|null, closes_at?: string|null, cycle_id?: string}} body
 * @param {{opens_at?: Date|string|null, closes_at?: Date|string|null}|null} existing stored values,
 *   used when only one end of the window is being changed.
 * @returns {{fields: object}|{error: string}}  fields hold Date|null and cycle_id.
 */
export function parseGateWindow(body, existing = null) {
  const fields = {};
  const read = (key) => {
    if (!(key in body)) return { present: false, ms: toMs(existing?.[key]) };
    const raw = body[key];
    if (raw === null || raw === '') return { present: true, ms: null };
    const ms = toMs(raw);
    return { present: true, ms, invalid: ms === null };
  };
  const opens = read('opens_at');
  const closes = read('closes_at');
  if (opens.invalid) return { error: 'Opens-at is not a valid date and time.' };
  if (closes.invalid) return { error: 'Closes-at is not a valid date and time.' };
  if (opens.ms !== null && closes.ms !== null && closes.ms <= opens.ms) {
    return { error: 'Closes-at must be after opens-at.' };
  }
  if (opens.present) fields.opens_at = opens.ms === null ? null : new Date(opens.ms);
  if (closes.present) fields.closes_at = closes.ms === null ? null : new Date(closes.ms);
  if ('cycle_id' in body) {
    const cycle = String(body.cycle_id || '').trim() || 'current';
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(cycle)) return { error: 'Cycle id may use letters, numbers, dot, dash and underscore (max 40).' };
    fields.cycle_id = cycle;
  }
  return { fields };
}

/** ISO -> value for <input type="datetime-local"> read as UTC ("2026-10-05T14:00"). */
export function toUtcInput(iso) {
  const ms = toMs(iso);
  return ms === null ? '' : new Date(ms).toISOString().slice(0, 16);
}

/** datetime-local value (UTC) -> ISO string, or null when empty/invalid. */
export function fromUtcInput(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
