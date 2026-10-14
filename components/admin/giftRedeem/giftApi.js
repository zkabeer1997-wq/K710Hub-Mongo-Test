// Small client helpers for the gift codes admin page.
const URL_BASE = '/api/admin-gift-codes';

export async function giftGet(params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
  const res = await fetch(qs ? `${URL_BASE}?${qs}` : URL_BASE, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not load.');
  return json;
}

export async function giftPost(action, payload = {}) {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Action failed.');
  return json;
}

/** Asks the runner endpoint to start now (same endpoint cron uses; admin session accepted). */
export async function startRunNow() {
  const res = await fetch('/api/cron/gift-redeem?mode=async', { method: 'POST', cache: 'no-store' });
  if (res.status !== 202 && !res.ok) throw new Error('Could not start the run.');
}

export function ago(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return 'never';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export const STATUS_LABEL = {
  success: 'Redeemed',
  received: 'Already had it',
  expired: 'Expired',
  login_failed: 'Login failed',
  skipped: 'Skipped',
  unknown: 'Unknown reply',
};

export const STATUS_TONE = {
  success: 'success', received: 'success', expired: 'neutral', login_failed: 'danger', skipped: 'neutral', unknown: 'accent',
};
