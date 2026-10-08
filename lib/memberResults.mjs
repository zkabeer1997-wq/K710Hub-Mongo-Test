// "Results" are NOT forms: pages where a member reads what leadership decided (their KvK
// appointments, their Noble Advisor time). They never count as "to do", have no red dot and
// are kept out of MEMBER_FORMS. The status API returns them additively as `results`.
import { appointmentLine } from './myAppointment.mjs';
import { APPOINTMENT_TYPES } from './kvkAppointments.mjs';
import { NOBLE_MY_HREF, nobleLine } from './nobleAppointment.mjs';
import { windowState } from './deadlines.mjs';

export const KVK_RESULT = { key: 'my-appointment', after: 'prep', group: 'kvk', label: 'My appointment', shortLabel: 'My appointment', href: '/forms/kvk-appointments', icon: 'calendar', kind: 'result' };
export const NOBLE_RESULT = { key: 'my-noble-appointment', after: 'noble', group: 'dragon', label: 'My Noble Advisor appointment', shortLabel: 'My Noble Advisor appointment', href: NOBLE_MY_HREF, icon: 'calendar', kind: 'result' };

/**
 * state: needs_form (nothing saved yet) | waiting (not published) | placed | not_placed | not_asked (published, said No)
 * `message` is the plain sentence under the title, `lines` the member's actual times.
 */
export function kvkResultRow({ prepSaved = false, published = false, publishedAt = null, assignments = [], asked = false, cycleStart = null } = {}) {
  const lines = published
    ? APPOINTMENT_TYPES.map((t) => assignments.find((a) => Number(a.day) === t.day && a.buff === t.buff)).filter(Boolean).map((a) => appointmentLine(a, cycleStart))
    : [];
  let state;
  let message;
  if (!prepSaved) { state = 'needs_form'; message = 'Fill in the KvK Prep & Appointments form first'; }
  else if (!published) { state = 'waiting'; message = 'Leadership has not published the schedule yet'; }
  else if (lines.length) { state = 'placed'; message = ''; }
  else if (asked) { state = 'not_placed'; message = 'You were not placed: no free time in your selected times. You can change your times in the form.'; }
  else { state = 'not_asked'; message = 'You did not ask for a buff this KvK, so there is nothing to place.'; }
  return { ...KVK_RESULT, state, message, lines, published, publishedAt, ready: state === 'placed' };
}

export function nobleResultRow({ saved = false, asked = false, published = false, publishedAt = null, assignment = null, cycleStart = null } = {}) {
  const lines = published && assignment ? [nobleLine(assignment, cycleStart)] : [];
  let state;
  let message;
  if (!saved) { state = 'needs_form'; message = 'Fill in the Noble Advisor form first'; }
  else if (!published) { state = 'waiting'; message = 'Leadership has not published the schedule yet'; }
  else if (lines.length) { state = 'placed'; message = ''; }
  else if (asked) { state = 'not_placed'; message = 'You were not placed: no free time in your selected times. You can change your times in the form.'; }
  else { state = 'not_asked'; message = 'You said No to a Noble Advisor time, so there is nothing to place.'; }
  return { ...NOBLE_RESULT, state, message, lines, published, publishedAt, ready: state === 'placed' };
}

/** Put each result row directly under the form it belongs to (`after`). Forms keep their order; unknown anchors append. */
export function withResults(forms = [], results = []) {
  const out = [];
  const pending = [...(results || [])];
  for (const form of forms) {
    out.push(form);
    for (let i = 0; i < pending.length;) {
      if (pending[i].after === form.key) out.push(pending.splice(i, 1)[0]);
      else i += 1;
    }
  }
  return [...out, ...pending.filter((r) => !out.includes(r))];
}

/** Forms still to do; result rows are never counted. */
export function todoCount(items = []) {
  return items.filter((f) => f.kind !== 'result' && f.needsInput).length;
}

/** localStorage key remembering that the member opened the page for this publication. */
export function resultSeenKey(result) {
  return `k710-result-seen:${result?.key}:${result?.publishedAt || ''}`;
}

/** True while a placed, published result has not been opened yet ("New: your appointment is ready"). */
export function isResultNew(result, seen = false) {
  return Boolean(result && result.ready && !seen);
}

// ---------------------------------------------------------------------------
// Visibility: only OPEN forms are listed, and a result row follows the form that owns it.
// ---------------------------------------------------------------------------

export const NOTHING_OPEN_MESSAGE = 'There is nothing to fill in right now. Check back when leadership opens a form.';
export const RESULT_UNAVAILABLE_MESSAGE = 'This page is not available right now. Leadership shows it while the {form} form is open.';

/** Owning form (gate key) and its name for each result page. */
export const RESULT_OWNER = {
  kvk: { formKey: 'prep', formLabel: 'KvK Prep & Appointments' },
  noble: { formKey: 'noble', formLabel: 'Noble Advisor' },
};

/** Text for a result page whose owning form is closed. `kind` is 'kvk' or 'noble'. */
export function resultUnavailableMessage(kind) {
  return RESULT_UNAVAILABLE_MESSAGE.replace('{form}', RESULT_OWNER[kind]?.formLabel || 'owning');
}

/**
 * The one visibility rule every member list uses (dashboard, sidebar, header menu, /forms, status API).
 * Only forms with state === 'open' stay; a result row (My appointment / My Noble Advisor
 * appointment) stays only while the form it follows (`after`) stays. Pure; order is preserved.
 * @returns {{forms: Array, results: Array, hidden: number}} hidden = forms + results removed.
 */
export function visibleMemberItems(forms = [], results = []) {
  const shown = (forms || []).filter((f) => f && f.state === 'open');
  const keys = new Set(shown.map((f) => f.key));
  const shownResults = (results || []).filter((r) => r && keys.has(r.after));
  return {
    forms: shown,
    results: shownResults,
    hidden: (forms || []).length - shown.length + ((results || []).length - shownResults.length),
  };
}

/**
 * Is the owning form open right now? `gates` is the form-gate map (as from getFormGates).
 * @returns {{kvk: boolean, noble: boolean}}
 */
export function resultPagesVisible(gates = {}, now = Date.now()) {
  const open = (key) => windowState(gates?.[key] || { is_open: true }, now).state === 'open';
  return { kvk: open(RESULT_OWNER.kvk.formKey), noble: open(RESULT_OWNER.noble.formKey) };
}
