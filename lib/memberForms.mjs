// Registry of member forms + pure status computation for navigation, the
// sidebar and the dashboard "Needs your input" card.
import { windowState, windowBadge } from './deadlines.mjs';
import { EVENT_FORMS } from './eventForms.mjs';

/** kind 'standing' forms are open until an admin closes them; 'event' forms need a window. */
export const MEMBER_FORMS = [
  { key: 'lead', gateKey: 'lead', label: 'Power Profile', shortLabel: 'Power Profile', href: '/power-profile', icon: 'shield', kind: 'standing' },
  { key: 'joiner', gateKey: 'joiner', label: 'KvK Availability', shortLabel: 'KvK Availability', href: '/dashboard/form', icon: 'calendar', kind: 'standing' },
  { key: 'prep', gateKey: 'prep', label: 'KvK Prep Backpack', shortLabel: 'KvK Prep', href: '/prep-phase-backpack', icon: 'backpack', kind: 'standing' },
  { key: 'dragon', gateKey: 'dragon', label: 'Flamedragon Tyrant', shortLabel: 'Flamedragon', href: '/flamedragon', icon: 'flame', kind: 'standing' },
  { key: 'noble', gateKey: 'noble', label: 'Noble Advisor Schedule', shortLabel: 'Noble Advisor', href: '/forms/flamedragon-tyrant/noble-advisor', icon: 'crown', kind: 'standing' },
  ...EVENT_FORMS.map((form) => ({
    key: form.gateKey, gateKey: form.gateKey, label: `${form.title} vote`, shortLabel: form.shortLabel,
    href: `/forms/${form.slug}`, icon: form.icon, kind: 'event',
  })),
];

/**
 * @param {{gates: Record<string, object>, submissions?: Record<string, string|null>, now?: number}} input
 *   submissions maps form key -> ISO last-updated (null/absent = nothing on file).
 * @returns Array of { key, label, shortLabel, href, icon, kind, state, submitted,
 *   updatedAt, needsInput, badge, opensAt, closesAt }
 */
export function computeFormStatuses({ gates = {}, submissions = {}, now = Date.now() }) {
  return MEMBER_FORMS.map((form) => {
    const gate = gates[form.gateKey] || { is_open: true };
    const win = windowState(gate, now, { requireWindow: form.kind === 'event' });
    const updatedAt = submissions[form.key] || null;
    const submitted = Boolean(updatedAt);
    return {
      ...form,
      state: win.state,
      opensAt: win.opensAt,
      closesAt: win.closesAt,
      updatedAt,
      submitted,
      needsInput: win.state === 'open' && !submitted,
      badge: windowBadge(win),
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
