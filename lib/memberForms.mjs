// Registry of member forms + pure status computation for navigation, the
// sidebar and the dashboard "Needs your input" card.
import { windowState, windowBadge, toMs, DAY } from './deadlines.mjs';
import { EVENT_FORMS } from './eventForms.mjs';

/** kind 'standing' forms are open until an admin closes them; 'event' forms need a window. */
export const MEMBER_FORMS = [
  { key: 'lead', gateKey: 'lead', label: 'Power Profile', shortLabel: 'Power Profile', href: '/power-profile', icon: 'shield', kind: 'standing' },
  { key: 'joiner', gateKey: 'joiner', label: 'KvK Availability', shortLabel: 'KvK Availability', href: '/dashboard/form', icon: 'calendar', kind: 'standing' },
  { key: 'prep', gateKey: 'prep', label: 'KvK Prep Backpack', shortLabel: 'KvK Prep', href: '/prep-phase-backpack', icon: 'backpack', kind: 'standing' },
  { key: 'dragon', gateKey: 'dragon', label: 'Flamedragon Tyrant', shortLabel: 'Flamedragon', href: '/flamedragon', icon: 'flame', kind: 'standing' },
  { key: 'noble', gateKey: 'noble', label: 'Noble Advisor Schedule', shortLabel: 'Noble Advisor', href: '/forms/flamedragon-tyrant/noble-advisor', icon: 'crown', kind: 'standing' },
  { key: 'appointments', gateKey: 'appointments', label: 'KvK Appointments', shortLabel: 'KvK Appointments', href: '/forms/kvk-appointments', icon: 'crown', kind: 'standing' },
  ...EVENT_FORMS.map((form) => ({
    key: form.gateKey, gateKey: form.gateKey, label: `${form.title} vote`, shortLabel: form.shortLabel,
    href: `/forms/${form.slug}`, icon: form.icon, kind: 'event',
  })),
];

/**
 * @param {{gates: Record<string, object>, submissions?: Record<string, string|null>,
 *   cycleInfo?: Record<string, {cycleLabel?: string|null, previousLabel?: string|null}>, now?: number}} input
 *   submissions maps form key -> ISO last-updated FOR THE CURRENT CYCLE of per-cycle forms
 *   (null/absent = not done this cycle). cycleInfo adds the cycle names per form key.
 * @returns Array of { key, label, shortLabel, href, icon, kind, state, submitted, updatedAt,
 *   needsInput, badge, opensAt, closesAt, cycleLabel, previousLabel, carriedOver }
 *   carriedOver = not done this cycle, but an earlier cycle's answer exists to start from.
 */
export function computeFormStatuses({ gates = {}, submissions = {}, cycleInfo = {}, now = Date.now() }) {
  return MEMBER_FORMS.map((form) => {
    const gate = gates[form.gateKey] || { is_open: true };
    const win = windowState(gate, now, { requireWindow: form.kind === 'event' });
    const updatedAt = submissions[form.key] || null;
    const submitted = Boolean(updatedAt);
    const info = cycleInfo[form.key] || {};
    const previousLabel = info.previousLabel || null;
    return {
      ...form,
      state: win.state,
      opensAt: win.opensAt,
      closesAt: win.closesAt,
      updatedAt,
      submitted,
      needsInput: win.state === 'open' && !submitted,
      badge: windowBadge(win),
      cycleLabel: info.cycleLabel || null,
      previousLabel,
      carriedOver: !submitted && Boolean(previousLabel),
      baseLabel: !submitted && !previousLabel ? info.baseLabel || null : null,
    };
  });
}

/** First open, unsubmitted form (event votes first because they have deadlines). */
export function firstIncomplete(statuses) {
  const pending = statuses.filter((s) => s.needsInput);
  return pending.find((s) => s.kind === 'event') || pending[0] || null;
}

/** "Still needs your input: Swordland, Tri-Alliance" (null when nothing is pending). */
export function stillNeedsSummary(statuses) {
  const names = statuses.filter((s) => s.needsInput).map((s) => s.shortLabel);
  return names.length ? `Still needs your input: ${names.join(', ')}` : null;
}

/**
 * Attach the buffs a member applied for to the Appointments entry. The one form covers all three
 * buffs, so saving it is "Done"; choosing fewer than 3 is fine and never reads as unfinished
 * (`partial` is kept at false for older callers). `appliedTitles` is e.g. "Day 1 Construction, Day 2 Research".
 */
export function withAppointmentProgress(statuses, appliedCount, appliedTotal, appliedTitles = '') {
  const count = Math.max(0, Number(appliedCount) || 0);
  const total = Math.max(1, Number(appliedTotal) || 1);
  return statuses.map((s) => (s.key === 'appointments'
    ? { ...s, appliedCount: count, appliedTotal: total, appliedTitles: String(appliedTitles || ''), partial: false }
    : s));
}

// ---------------------------------------------------------------------------
// Ordering for every "My forms" list (dashboard, sidebar, header menu, /forms).
// ---------------------------------------------------------------------------

/** Forms that belong to each event cycle, in the order a member should work through them. */
export const CYCLE_FORM_ORDER = {
  kvk: ['prep', 'joiner', 'appointments'],
  flamedragon: ['dragon', 'noble'],
};
export const CYCLE_TITLES = { kvk: 'KvK', flamedragon: 'Flamedragon' };
const CYCLE_BY_FORM = Object.fromEntries(
  Object.entries(CYCLE_FORM_ORDER).flatMap(([cycle, keys]) => keys.map((k) => [k, cycle]))
);
const REGISTRY_INDEX = Object.fromEntries(MEMBER_FORMS.map((f, i) => [f.key, i]));

/** Start of a cycle date: date-only strings are midnight UTC. */
export function cycleStartMs(cycle) {
  return toMs(cycle?.start);
}

/** End of a cycle date. A date-only end ("2026-10-09") means the END of that UTC day. */
export function cycleEndMs(cycle) {
  const raw = cycle?.end;
  const ms = toMs(raw);
  if (ms === null) return null;
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? ms + DAY : ms;
}

/** A cycle is ongoing when it is collecting answers and (when dates exist) now is inside them. */
export function isCycleOngoing(cycle, now = Date.now()) {
  if (!cycle || cycle.status !== 'collecting') return false;
  const start = cycleStartMs(cycle);
  const end = cycleEndMs(cycle);
  if (start !== null && now < start) return false;
  if (end !== null && now >= end) return false;
  return true;
}

/** Ongoing cycle ids, the one ending soonest first (no end date = last), ties KvK first. */
export function ongoingCycleOrder(cycles = {}, now = Date.now()) {
  return Object.keys(CYCLE_FORM_ORDER)
    .filter((id) => isCycleOngoing(cycles?.[id], now))
    .sort((a, b) => {
      const ea = cycleEndMs(cycles[a]) ?? Infinity;
      const eb = cycleEndMs(cycles[b]) ?? Infinity;
      if (ea === eb) return 0;
      return ea < eb ? -1 : 1;
    });
}

/**
 * The closing time shown for a form: its own window first, then the end of its cycle.
 * @returns {{at: number, kind: 'closes'|'cycle'|'opens'}|null}
 */
export function formDeadline(form, cycles = {}, now = Date.now()) {
  if (form.state === 'open') {
    if (form.closesAt !== null && form.closesAt !== undefined && form.closesAt > now) return { at: form.closesAt, kind: 'closes' };
    const cycleId = CYCLE_BY_FORM[form.key];
    const end = cycleId && isCycleOngoing(cycles?.[cycleId], now) ? cycleEndMs(cycles[cycleId]) : null;
    if (end !== null && end > now) return { at: end, kind: 'cycle' };
    return null;
  }
  if (form.state === 'upcoming' && form.opensAt !== null && form.opensAt !== undefined && form.opensAt > now) {
    return { at: form.opensAt, kind: 'opens' };
  }
  return null;
}

/**
 * Put the member's forms in the order they matter right now:
 *  1. forms of the ongoing cycle(s), in workflow order (KvK: Prep, Availability, Appointments;
 *     Flamedragon: Tyrant, Noble Advisor). Both ongoing: the cycle ending soonest first, tie KvK.
 *  2. Power Profile
 *  3. open event votes, soonest-closing first
 *  4. any other open form
 *  5. forms that are not open: opening soon (soonest first), then closed, at the very bottom
 * Inside a group (and inside one cycle) forms that still need input come before finished ones.
 * Every status also gets `group` and `deadline` ({at, kind} | null). Pure; does not mutate input.
 */
export function orderMemberForms(statuses = [], cycles = {}, now = Date.now()) {
  const ongoing = ongoingCycleOrder(cycles, now);
  const rows = statuses.map((form, index) => {
    const cycleId = CYCLE_BY_FORM[form.key];
    const open = form.state === 'open';
    const cycleRank = cycleId ? ongoing.indexOf(cycleId) : -1;
    let group;
    let rank = 0;
    if (!open) {
      group = form.state === 'upcoming' ? 'upcoming' : 'closed';
      rank = form.state === 'upcoming' ? form.opensAt ?? Infinity : 0;
    } else if (cycleRank >= 0) group = 'cycle';
    else if (form.key === 'lead') group = 'profile';
    else if (form.kind === 'event') {
      group = 'vote';
      rank = form.closesAt ?? Infinity;
    } else group = 'other';
    const workflow = cycleId ? CYCLE_FORM_ORDER[cycleId].indexOf(form.key) : 0;
    const order = ['cycle', 'profile', 'vote', 'other', 'upcoming', 'closed'].indexOf(group);
    return {
      form: { ...form, group, deadline: formDeadline(form, cycles, now) },
      key: [order, group === 'cycle' ? cycleRank : 0, form.submitted && open ? 1 : 0, rank, group === 'cycle' ? workflow : 0, REGISTRY_INDEX[form.key] ?? 99, index],
    };
  });
  rows.sort((a, b) => {
    for (let i = 0; i < a.key.length; i += 1) {
      if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1;
    }
    return 0;
  });
  return rows.map((r) => r.form);
}

/** Dashboard link list. The Admin entry is for admin / superadmin only (role comes from the live profile). */
export function dashboardLinks(role) {
  const links = [
    { key: 'events', label: 'Events & schedules', href: '/events' },
    { key: 'guides', label: 'Guides', href: '/guides' },
    { key: 'tools', label: 'Upgrade calculators & tools', href: '/tools' },
  ];
  if (role === 'admin' || role === 'superadmin') links.push({ key: 'admin', label: 'Admin dashboard', href: '/admin/dashboard/overview' });
  return links;
}

/** Plain-language "what this form needs from you" text, one source of truth for every list. */
export const FORM_PLAIN = {
  lead: 'Your gear, charms, pets and masters. Update it when something changes.',
  joiner: 'When you can play during KvK, plus your troop levels and heroes.',
  prep: 'Your backpack items and the times you can play during the preparation days.',
  appointments: 'Ask for a minister or advisor buff time slot.',
  dragon: 'Your troop levels and heroes for the event.',
  noble: 'Book a troop training time with the Noble Advisor.',
  swordland: 'Vote on how you will take part.',
  'tri-alliance': 'Vote on how you will take part.',
};

/**
 * Cycle-end deadline entries for buildDeadlineEntries: only for an ongoing cycle with an end date
 * whose open forms do not all carry their own closing time ("KvK cycle ends").
 */
export function cycleDeadlineEntries(statuses = [], cycles = {}, now = Date.now()) {
  const out = [];
  for (const id of ongoingCycleOrder(cycles, now)) {
    const end = cycleEndMs(cycles[id]);
    if (end === null || end <= now) continue;
    const open = statuses.filter((s) => CYCLE_FORM_ORDER[id].includes(s.key) && s.state === 'open');
    if (open.length === 0 || open.every((s) => s.closesAt !== null && s.closesAt !== undefined)) continue;
    out.push({ id, title: CYCLE_TITLES[id], at: end, href: open[0].href });
  }
  return out;
}

/**
 * Display state for one form row, shared by the dashboard list and the /forms checklist.
 * @returns {{id: 'closed'|'soon'|'done'|'carry'|'todo', label: string, button: {text: string, disabled?: boolean, quiet?: boolean, primary?: boolean}}}
 */
export function formDisplayState(form) {
  if (form.state === 'closed') return { id: 'closed', label: 'Closed', button: { text: 'Closed', disabled: true } };
  if (form.state === 'upcoming') return { id: 'soon', label: form.badge || 'Opens soon', button: { text: 'Not open yet', disabled: true } };
  if (form.submitted) return { id: 'done', label: 'Done', button: { text: 'Change my answers', quiet: true } };
  if (form.carriedOver) return { id: 'carry', label: 'Check and save', button: { text: 'Check and save', primary: true } };
  return { id: 'todo', label: 'To do', button: { text: form.key === 'lead' ? 'Open' : 'Fill in', primary: true } };
}
