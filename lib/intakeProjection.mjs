// Client-safe helpers for an intake period's projected transfer status
// (Leading / Ordinary) and the power cap for each status.

export const TRANSFER_STATUSES = ['leading', 'ordinary'];
export const STATUS_NAMES = { leading: 'Leading', ordinary: 'Ordinary' };
const CAP_MAX = 20;

export function normalizeStatus(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return TRANSFER_STATUSES.includes(v) ? v : null;
}

// Caps are typed by admins as short text, e.g. "250M" or "1.2B".
export function normalizeCap(value) {
  return String(value ?? '').trim().slice(0, CAP_MAX);
}

// What the public form shows for a period: the selected status and its cap.
export function projectionFor(period) {
  const status = normalizeStatus(period?.transfer_status);
  if (!status) return null;
  const cap = normalizeCap(status === 'leading' ? period?.leading_cap : period?.ordinary_cap);
  return { status, name: STATUS_NAMES[status], cap: cap || null };
}
