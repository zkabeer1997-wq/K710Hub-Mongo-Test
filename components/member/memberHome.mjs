// Pure view-model for the simplified member dashboard (components/member/MemberDashboard.jsx).
// Everything here is derived from the data /api/member-form-status already returns, so gates,
// windows and the open/closed rule stay in lib/memberFormStatus.server.js and lib/formGates*.

/** The four member forms, in the order the owner wants them shown (number 1-4). */
export const DASHBOARD_FORM_KEYS = ['prep', 'noble', 'dragon', 'joiner'];

/** Catalog keys per form (title + one helper line). */
export const FORM_TEXT = {
  prep: { title: 'form.prep.title', help: 'form.prep.help' },
  noble: { title: 'form.noble.title', help: 'form.noble.help' },
  dragon: { title: 'form.dragon.title', help: 'form.dragon.help' },
  joiner: { title: 'form.joiner.title', help: 'form.joiner.help' },
};

/**
 * Visual state of one form card: todo | carry | done | closed | soon.
 * (Only open forms normally arrive; closed/soon are handled in case the API ever returns them.)
 */
export function cardState(form) {
  if (form.state === 'closed') return 'closed';
  if (form.state === 'upcoming') return 'soon';
  if (form.submitted) return 'done';
  if (form.carriedOver) return 'carry';
  return 'todo';
}

/**
 * Split the API's forms into what the dashboard shows.
 * @param {{forms?: object[], results?: object[], hidden?: number}} status
 * @returns {{cards: object[], power: object|null, extras: object[], results: object[], left: number, closed: number}}
 */
export function buildHome(status = {}) {
  const forms = Array.isArray(status.forms) ? status.forms : [];
  const byKey = new Map(forms.map((f) => [f.key, f]));
  const cards = DASHBOARD_FORM_KEYS.map((key) => byKey.get(key)).filter(Boolean)
    .map((form, index) => ({ ...form, number: index + 1, card: cardState(form) }));
  const extras = forms.filter((f) => f.kind === 'event').map((form) => ({ ...form, card: cardState(form) }));
  const power = byKey.get('lead') || null;
  const left = [...cards, ...extras].filter((f) => f.needsInput).length;
  return {
    cards,
    power,
    extras,
    results: Array.isArray(status.results) ? status.results : [],
    left,
    closed: Number(status.hidden) || 0,
  };
}

/** Deadline shown on a card: { kind: 'before'|'opens'|'none', at }. Closing time first, then cycle end. */
export function cardDate(form) {
  const d = form.deadline;
  if (d && (d.kind === 'closes' || d.kind === 'cycle')) return { kind: 'before', at: d.at };
  if (d && d.kind === 'opens') return { kind: 'opens', at: d.at };
  return { kind: 'none', at: null };
}

/** BCP-47 locale used for dates: latin digits for Arabic so times stay easy to read. */
export function dateLocale(language) {
  if (language === 'en') return 'en-GB';
  if (language === 'ar') return 'ar-u-nu-latn';
  if (language === 'zh') return 'zh-CN';
  return language || 'en-GB';
}

/** Date + time in the member's own time zone (the browser's). Never throws. */
export function formatWhen(ms, language) {
  try {
    return new Intl.DateTimeFormat(dateLocale(language), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Short day + month ("8 Oct") for "Saved ...". */
export function formatDay(value, language) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'short' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
