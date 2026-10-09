// Pure helpers for the admin Overview and the Drive banner. No Mongo, no Next.

/** The Drive banner shows only when Drive is known to be disconnected. */
export function driveBannerVisible(status) {
  return Boolean(status) && status.connected === false;
}

/** "in 3 days", "in 5 hours", "in 20 minutes", "now" for a future timestamp (ms). */
export function startsInText(targetMs, now = Date.now()) {
  if (!Number.isFinite(targetMs)) return '';
  const diff = targetMs - now;
  if (diff <= 0) return 'now';
  const min = Math.round(diff / 60000);
  if (min < 60) return `in ${Math.max(min, 1)} minute${min === 1 ? '' : 's'}`;
  const hours = Math.round(diff / 3600000);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(diff / 86400000);
  return `in ${days} days`;
}

/**
 * Most urgent first. Each item may carry `urgency` (lower = more urgent, default 50)
 * and `whenMs` (a deadline; sooner wins within the same urgency). Stable otherwise.
 */
export function rankAttention(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ua = a.item.urgency ?? 50;
      const ub = b.item.urgency ?? 50;
      if (ua !== ub) return ua - ub;
      const wa = Number.isFinite(a.item.whenMs) ? a.item.whenMs : Infinity;
      const wb = Number.isFinite(b.item.whenMs) ? b.item.whenMs : Infinity;
      if (wa !== wb) return wa - wb;
      return a.index - b.index;
    })
    .map((x) => x.item);
}

/** One line for the Overview health row about gift code sources. */
export function giftCodeHealth(sources, now = Date.now()) {
  const list = (sources || []).filter((s) => s.enabled !== false);
  if (!list.length) return { kind: 'none', text: 'Gift codes: no automatic sources' };
  const checked = list.map((s) => Date.parse(s.last_checked_at)).filter(Number.isFinite);
  if (!checked.length) return { kind: 'warn', text: 'Gift codes: never checked' };
  const bad = list.filter((s) => s.result === 'blocked' || s.result === 'failed' || s.result === 'changed_shape');
  const latest = Math.max(...checked);
  const hours = Math.round((now - latest) / 3600000);
  const age = hours < 1 ? 'just now' : hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
  if (bad.length === list.length) return { kind: 'warn', text: `Gift codes: every source failed, last checked ${age}` };
  if (hours > 48) return { kind: 'warn', text: `Gift codes: last checked ${age}` };
  return { kind: 'ok', text: `Gift codes: checked ${age}` };
}

/** One line for the Overview health row about Google Drive. */
export function driveHealth(status) {
  if (!status) return { kind: 'none', text: 'Google Drive: status unavailable' };
  if (status.connected) return { kind: 'ok', text: `Google Drive: connected${status.fake ? ' (local test Drive)' : status.email ? ` as ${status.email}` : ''}` };
  return { kind: 'warn', text: 'Google Drive: not connected, images cannot be uploaded' };
}

/** Moving someone up to admin or superadmin needs an explicit confirmation. */
export function needsPromotionConfirm(fromRole, toRole) {
  const rank = { member: 0, admin: 1, superadmin: 2 };
  return (rank[toRole] ?? 0) > (rank[fromRole] ?? 0) && (toRole === 'admin' || toRole === 'superadmin');
}

/** Intake periods newest first (by created_at, then label), without changing the input. */
export function sortPeriodsNewestFirst(periods) {
  return [...(periods || [])].sort((a, b) => {
    const ta = Date.parse(a.created_at) || 0;
    const tb = Date.parse(b.created_at) || 0;
    if (ta !== tb) return tb - ta;
    return String(b.label).localeCompare(String(a.label));
  });
}
