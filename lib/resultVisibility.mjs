// Admin-side wording for the owner rule "My appointment is visible only while its form is open".
// Pure helpers shared by the Appointments tab, the Noble tab and the event page confirmations.

const KINDS = {
  kvk: { formKey: 'prep', formLabel: 'KvK Prep & Appointments', result: 'My appointment' },
  noble: { formKey: 'noble', formLabel: 'Noble Advisor', result: 'My Noble Advisor appointment' },
};

/** Which result kind an event-control type owns: kvk -> 'kvk', flamedragon -> 'noble'. */
export function resultKindForEvent(type) {
  return type === 'kvk' ? 'kvk' : type === 'flamedragon' ? 'noble' : null;
}

export function resultOwner(kind) {
  return KINDS[kind] || null;
}

/** Small status line for the tab header: "Members can see My appointment: Yes (form open)". */
export function visibilityStatusLine(kind, formOpen) {
  const k = KINDS[kind];
  if (!k) return '';
  return `Members can see ${k.result}: ${formOpen ? 'Yes (form open)' : 'No (form closed)'}`;
}

/**
 * Extra confirmation line when closing forms. Applies only when the close reaches the owning form
 * (`formKey` empty = all forms of the event), that form is open now and a schedule is published.
 * @returns {string|null}
 */
export function closeFormsWarning(kind, { formKey = '', published = false, formOpen = true } = {}) {
  const k = KINDS[kind];
  if (!k || !published || !formOpen) return null;
  if (formKey && formKey !== k.formKey) return null;
  return `Members will no longer see ${k.result} while this form is closed. Keep the form open if you want members to see their appointment.`;
}

/** Extra confirmation line when publishing while the owning form is closed. */
export function publishFormClosedWarning(kind, formOpen) {
  const k = KINDS[kind];
  if (!k || formOpen !== false) return null;
  return `The form is closed, so members cannot see ${k.result}. Open the form so they can.`;
}
