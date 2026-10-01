// Per-event participation forms (Swordland, Tri-Alliance, Castle Battle).
// Pure config + validation, shared by the page, the API route and the tests.

export const EVENT_FORMS = [
  { slug: 'swordland-showdown', gateKey: 'swordland', title: 'Swordland Showdown', shortLabel: 'Swordland', icon: 'sword' },
  { slug: 'tri-alliance-clash', gateKey: 'tri-alliance', title: 'Tri-Alliance Clash', shortLabel: 'Tri-Alliance', icon: 'shield' },
  { slug: 'castle-battle', gateKey: 'castle-battle', title: 'Castle Battle', shortLabel: 'Castle Battle', icon: 'castle' },
];

export const EVENT_FORM_GATE_KEYS = EVENT_FORMS.map((form) => form.gateKey);

export function findEventForm(slug) {
  return EVENT_FORMS.find((form) => form.slug === slug) || null;
}

export function eventFormByGateKey(key) {
  return EVENT_FORMS.find((form) => form.gateKey === key) || null;
}

export const VOTE_OPTIONS = [
  { value: 'legion_time', label: 'Legion time', hint: 'I will join at the legion time my alliance posts.' },
  { value: 'flexible', label: 'Flexible', hint: 'Put me wherever leadership needs me.' },
  { value: 'absent', label: 'Absent', hint: 'I cannot take part this time.' },
];

export const MAX_POWER = 99_999_999_999;
export const DEFAULT_CYCLE_ID = 'current';

/** Accepts 12345678, "12,345,678" or "12 345 678"; rejects everything else. */
export function parsePower(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= MAX_POWER ? value : null;
  const cleaned = String(value ?? '').trim().replace(/[,\s_]/g, '');
  if (!/^\d{1,12}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= MAX_POWER ? n : null;
}

export function validateParticipation(body) {
  const vote = String(body?.vote || '');
  if (!VOTE_OPTIONS.some((option) => option.value === vote)) {
    return { error: 'Choose legion time, flexible or absent.' };
  }
  const power = parsePower(body?.power);
  if (power === null) return { error: 'Enter your current power as a whole number.' };
  return { value: { vote, power } };
}
