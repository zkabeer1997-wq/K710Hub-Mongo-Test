// Pure helpers for the admin Inbox (transfer requests + website requests).

export const DECISION_LABELS = {
  pending: 'Pending',
  special: 'Accepted (Special)',
  normal: 'Accepted (Normal)',
  reject: 'Rejected',
  waitlist: 'Waitlisted',
};

/** One plain sentence stating what a decision will do, for the confirm step. */
export function decisionConfirmText(status, name) {
  const who = String(name || '').trim() || 'this applicant';
  switch (status) {
    case 'special':
      return `Accept ${who} into 710 as Special? They will be able to sign in.`;
    case 'normal':
      return `Accept ${who} into 710? They will be able to sign in.`;
    case 'reject':
      return `Reject ${who}? They will not get a place in 710. You can change this later.`;
    case 'waitlist':
      return `Put ${who} on the waitlist? They stay in your list for later and cannot sign in yet.`;
    case 'pending':
      return `Move ${who} back to pending?`;
    default:
      return `Change the decision for ${who}?`;
  }
}

/** Ready-to-send plain message for the new member (paste into Discord). */
export function acceptanceMessage({ name, playerId, origin = '' } = {}) {
  const base = String(origin || '').replace(/\/$/, '');
  const who = String(name || '').trim();
  return [
    `Hi${who ? ` ${who}` : ''}! You have been accepted into Kingdom 710.`,
    `To sign in, open ${base}/login and enter your Kingshot Player ID${playerId ? ` (${playerId})` : ''}.`,
    'The page will ask you to confirm it is you with a short code in your in-game profile. Follow the steps on screen.',
    'Welcome to the kingdom!',
  ].join('\n');
}

/**
 * Map of row id -> other rows (ids) that share the same Player ID.
 * Rows without a Player ID are never flagged.
 */
export function findDuplicateApplicants(rows) {
  const byPlayer = new Map();
  (rows || []).forEach((row) => {
    const pid = String(row?.player_id || '').trim();
    if (!pid) return;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid).push(row);
  });
  const dupes = new Map();
  byPlayer.forEach((group) => {
    if (group.length < 2) return;
    group.forEach((row) => {
      dupes.set(row.id, group.filter((other) => other.id !== row.id).map((other) => other.id));
    });
  });
  return dupes;
}

export const REQUEST_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'rejected', label: 'Not doing' },
];

/** Legacy rows used 'reviewed' for finished work. */
export function normalizeRequestStatus(status) {
  if (status === 'reviewed') return 'done';
  return REQUEST_STATUS_OPTIONS.some((o) => o.value === status) ? status : 'new';
}

/** Name to show for a website request: roster name, else Kingshot nickname, else "Member <id>". */
export function requestDisplayName(row, nicknameById = new Map()) {
  const name = String(row?.name || '').trim();
  const id = String(row?.member_id || '').trim();
  if (name && name !== id) return { name, note: '' };
  const nick = id ? String(nicknameById.get(id) || '').trim() : '';
  if (nick) return { name: nick, note: 'Kingshot name' };
  return { name: id ? `Member ${id}` : '-', note: id ? 'not on the roster' : '' };
}
