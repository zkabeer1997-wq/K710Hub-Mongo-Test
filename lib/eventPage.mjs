// Pure helpers for the admin event pages (KvK / Flamedragon): URL state,
// remembered tab, the forms status strip, confirm summaries, the
// Participants table cells and the bulk "add to rally" plan. No React and no
// browser globals so they can be unit tested with node:test.

export const ASSIGN_FILTERS = ['assigned', 'unassigned'];

// ---------- URL + remembered tab (E5, E6) ----------

/** Reads ?tab and ?filter from a query string. Unknown values come back as ''. */
export function readEventUrl(search, tabs = []) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  let tab = params.get('tab') || '';
  if (tab === 'prep') tab = 'appointments'; // old "Prep ministers" tab links
  if (!tabs.some((t) => t.id === tab)) tab = '';
  let filter = params.get('filter') || '';
  if (!ASSIGN_FILTERS.includes(filter)) filter = '';
  return { tab, filter };
}

/** Returns the new "?..." query for a tab/filter change, keeping any other params. */
export function buildEventSearch(currentSearch, { tab, filter }) {
  const params = new URLSearchParams(String(currentSearch || '').replace(/^\?/, ''));
  if (tab) params.set('tab', tab);
  else params.delete('tab');
  // The assignment filter only exists on the Participants tab.
  if (filter && ASSIGN_FILTERS.includes(filter) && (!tab || tab === 'participants')) params.set('filter', filter);
  else params.delete('filter');
  const out = params.toString();
  return out ? `?${out}` : '';
}

export function lastTabStorageKey(type) {
  return `k710-admin-event-tab-${type}`;
}

/** URL tab wins, then the remembered tab, then Participants. */
export function resolveEventTab(tabs, urlTab, storedTab) {
  const ok = (id) => Boolean(id) && tabs.some((t) => t.id === id);
  if (ok(urlTab)) return urlTab;
  if (ok(storedTab)) return storedTab;
  return 'participants';
}

// ---------- Assigned / unassigned (E5) ----------

/** Member ids that are a joiner or the lead of any rally (as strings). */
export function assignedMemberIds(rallies) {
  const ids = new Set();
  for (const rally of rallies || []) {
    for (const id of rally.memberIds || []) ids.add(String(id));
    if (rally.leadMemberId) ids.add(String(rally.leadMemberId));
  }
  return ids;
}

export function filterByAssignment(rows, filter, assignedIds) {
  if (filter !== 'assigned' && filter !== 'unassigned') return rows;
  return rows.filter((row) => assignedIds.has(String(row.member_id)) === (filter === 'assigned'));
}

export function assignFilterLabel(filter) {
  if (filter === 'assigned') return 'Assigned to a rally';
  if (filter === 'unassigned') return 'Not in a rally';
  return '';
}

// ---------- Forms strip (E1) and action summaries (E4) ----------

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formsStripSummary(forms) {
  const list = forms || [];
  const open = list.filter((f) => f.is_open).length;
  return { open, total: list.length, text: `${open} of ${list.length} forms open` };
}

/** One factual line saying exactly what the action will do. */
export function actionSummary(action, state, eventName = 'event') {
  const c = state?.counts || {};
  const forms = state?.forms || [];
  const openForms = c.forms_open ?? forms.filter((f) => f.is_open).length;
  const totalForms = c.forms_total ?? forms.length;
  const applicants = c.applicants ?? 0;
  switch (action) {
    case 'close_forms':
      return `Closes ${plural(openForms, 'form')}; ${plural(applicants, 'answer')} kept`;
    case 'open_forms':
      return `Opens ${plural(Math.max(totalForms - openForms, 0), 'form')}; members can answer straight away`;
    case 'start_cycle':
      return state?.cycle
        ? `Closes ${state.cycle.label || `this ${eventName} cycle`} and moves it to History with ${plural(applicants, 'applicant')}; opens ${plural(totalForms, 'fresh form')}`
        : `Opens ${plural(totalForms || 3, 'form')} for the new cycle`;
    case 'archive_reset':
      return `Closes ${plural(openForms, 'form')} and ends the cycle; ${plural(applicants, 'applicant')} kept in History`;
    default:
      return '';
  }
}

// ---------- Participants cells (P1, P2) ----------

/** Top N heroes for the chip row; the rest are summarised as "+N". */
export function heroChips(heroes, max = 3) {
  const list = Array.isArray(heroes) ? heroes.filter(Boolean) : [];
  return { shown: list.slice(0, max), rest: list.slice(max), restCount: Math.max(list.length - max, 0), all: list };
}

function unitLevel(tier, tg) {
  return [tier, tg].filter(Boolean).join('/');
}

/** `I T11/TG8 · C T10/TG7 · A T11/TG6`; empty units are left out; '' when none. */
export function compactTroopLevels(row) {
  return [
    ['I', row?.infantry_tier, row?.infantry_tg],
    ['C', row?.cavalry_tier, row?.cavalry_tg],
    ['A', row?.archer_tier, row?.archer_tg],
  ]
    .map(([letter, tier, tg]) => {
      const level = unitLevel(tier, tg);
      return level ? `${letter} ${level}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/** "First half (12-14:30 UTC)" -> { label: 'First half', detail: '12-14:30 UTC' }. */
export function splitAvailability(value) {
  const text = String(value || '').trim();
  if (!text) return { label: '', detail: '' };
  const m = text.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { label: m[1], detail: m[2] } : { label: text, detail: '' };
}

// ---------- Bulk add to rally (P3) ----------

/**
 * Plans "add these members to this rally" without moving anyone who already has
 * a place: rally leads and members already in a rally are skipped and reported.
 * Uses the supplied assign function (assignMemberToRally) for the real change.
 */
export function planBulkAddToRally(rallies, rallyId, memberIds, assign, nameOf = (id) => id) {
  const target = (rallies || []).find((r) => r.id === rallyId);
  const leadIds = new Set((rallies || []).map((r) => (r.leadMemberId ? String(r.leadMemberId) : '')).filter(Boolean));
  const placeById = new Map();
  for (const rally of rallies || []) {
    for (const id of rally.memberIds || []) placeById.set(String(id), rally.name);
  }
  const added = [];
  const skipped = [];
  let next = rallies || [];
  if (!target) return { rallies: next, added, skipped, message: 'That rally no longer exists.' };
  for (const raw of memberIds || []) {
    const id = String(raw);
    if (leadIds.has(id)) {
      skipped.push({ id, reason: 'is a rally lead' });
    } else if (placeById.has(id)) {
      skipped.push({ id, reason: placeById.get(id) === target.name ? `is already in ${target.name}` : `is already in ${placeById.get(id)}` });
    } else {
      next = assign(next, rallyId, id);
      added.push(id);
    }
  }
  const parts = [];
  if (added.length) parts.push(`Added ${plural(added.length, 'member')} to ${target.name}.`);
  if (skipped.length) {
    const shown = skipped.slice(0, 3).map((s) => `${nameOf(s.id)} ${s.reason}`).join('; ');
    const more = skipped.length > 3 ? `; and ${skipped.length - 3} more` : '';
    parts.push(`Skipped ${skipped.length}: ${shown}${more}.`);
  }
  if (!parts.length) parts.push('No members selected.');
  return { rallies: next, added, skipped, message: parts.join(' ') };
}
