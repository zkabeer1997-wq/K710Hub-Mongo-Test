import { formatUtc, toMs } from '../../lib/deadlines.mjs';

const pad = (n) => String(n).padStart(2, '0');

/** ISO -> value for <input type="datetime-local"> in the viewer's local time. */
export function toLocalInput(iso) {
  const ms = toMs(iso);
  if (ms === null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (local time) -> ISO UTC string, or null when empty. */
export function fromLocalInput(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function formatLocal(iso) {
  const ms = toMs(iso);
  if (ms === null) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  } catch {
    return '';
  }
}

export function localZoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';
  } catch {
    return 'your local time';
  }
}

/** Chip kind + text for a form given its window state. */
export function describeFormState(state, opensAt, closesAt, reason) {
  if (state === 'open') return { kind: 'open', text: 'Open now' };
  if (state === 'upcoming') {
    return { kind: 'upcoming', text: opensAt ? `Opens ${formatUtc(opensAt)}` : 'Not scheduled' };
  }
  if (state === 'ended') return { kind: 'ended', text: closesAt ? `Ended ${formatUtc(closesAt)}` : 'Ended' };
  if (reason === 'window' && closesAt) return { kind: 'closed', text: `Closed on ${formatUtc(closesAt)}` };
  return { kind: 'closed', text: 'Closed' };
}
