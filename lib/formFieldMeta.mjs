// Client-safe defaults for the Form Gates "Edit Form" editor.
//
// These 6 forms are hand-written React (no schema drives their layout,
// validation, or field types), so the editor only covers what's safe to
// change without touching form logic: intro copy (kicker/heading/
// description) for every form, plus per-field label/placeholder/help
// text (and their relative order) for the two forms simple enough to
// render their fields from this list (Transfer Request, Website
// Requests). The remaining forms only expose intro-copy editing.
//
// Do NOT import this from a server-only module's dependency chain in a
// way that would pull in ./mongo — this file must stay client-safe.

export const FORM_META_KEYS = ['interest', 'lead', 'joiner', 'prep', 'dragon', 'noble', 'requests'];

export const FORM_META_TITLES = {
  interest: 'Transfer Request (Interest Form)',
  lead: 'Gear Tracking',
  joiner: 'KvK Availability',
  prep: 'KvK Prep',
  dragon: 'Flamedragon Tyrant',
  noble: 'Noble Advisor Schedule',
  requests: 'Website Requests',
};

export const DEFAULT_FORM_INTRO = {
  interest: { kicker: '', heading: '', description: '' },
  lead: {
    kicker: 'Kingdom 710 member profile',
    heading: 'Gear Tracking',
    description: 'Keep your troop levels, heroes, Governor Gear, charms, and power information up to date.',
  },
  joiner: {
    kicker: 'KvK Availability',
    heading: 'Battle availability',
    description: 'Tell planners which half of the battle window you can cover. You are signed in with Kingshot — no PIN is required.',
  },
  prep: {
    kicker: "Minister's Hall",
    heading: 'Backpack Amounts & Minister Position Bookings',
    description: '',
  },
  dragon: {
    kicker: 'Flamedragon Tyrant',
    heading: 'Availability, Levels, and Heroes',
    description: '',
  },
  noble: {
    kicker: '',
    heading: 'Noble Advisor Schedule',
    description: '',
  },
  requests: {
    kicker: 'Website Requests',
    heading: 'Improve K710Hub',
    description: 'Suggest an improvement - tell the admin team what you would like to see added, fixed, or improved.',
  },
};

// Only forms whose fields are rendered from this list (not deep hand-written
// JSX) get a non-empty entry — see the comment above.
export const DEFAULT_FORM_FIELDS = {
  // Only the plain text/number fields are wired to this editor — the
  // radio-group and checkbox questions elsewhere in the wizard keep their
  // hardcoded copy for now (retrofitting those safely needs the same
  // treatment WebsiteRequestForm got, not done in this pass).
  interest: [
    { key: 'inGameName', label: 'In-game name' },
    { key: 'playerId', label: 'Player ID' },
    { key: 'discordUsername', label: 'Discord username' },
    { key: 'currentServer', label: 'Your current server (prior to transfer)' },
    { key: 'currentAlliance', label: 'Your current alliance (prior to transfer)' },
    { key: 'currentTg', label: 'Current amount of TG', placeholder: 'We need to understand how far you can push your TG level' },
    { key: 'mysticTrialStages', label: 'Current Mystic Trial TOTAL STAGES' },
    { key: 'totalPower', label: 'Total Power' },
    { key: 'passesRequired', label: 'Number of passes required for you to transfer to 710' },
    { key: 'currentPasses', label: 'Your current number of transfer passes' },
  ],
  lead: [],
  joiner: [],
  prep: [],
  dragon: [],
  noble: [],
  requests: [
    { key: 'current_alliance', label: 'Current Alliance', placeholder: 'Select alliance', help_text: 'Select the alliance you are currently in.' },
    { key: 'section', label: 'Section', placeholder: 'Select a section', help_text: 'Select the section your suggestion is about.' },
    { key: 'message', label: 'Your suggestion', placeholder: "Describe the improvement you'd like to see...", help_text: "Be as specific as you can - what's the problem, and what would you like instead?" },
  ],
};

// Only forms that actually render their fields from the merged array (see
// the field-list comment above) can safely reorder — for the others,
// `order` is stored but has no visual effect, so the editor hides reorder
// controls rather than imply it does something it doesn't.
export const FORM_FIELDS_REORDERABLE = { requests: true };

export function mergeFormFields(formKey, overrides) {
  const defaults = DEFAULT_FORM_FIELDS[formKey] || [];
  const byKey = new Map((overrides || []).map((f) => [f.key, f]));
  const merged = defaults.map((def, index) => {
    const override = byKey.get(def.key) || {};
    return {
      key: def.key,
      label: override.label || def.label,
      placeholder: override.placeholder ?? def.placeholder ?? '',
      help_text: override.help_text ?? def.help_text ?? '',
      order: Number.isFinite(override.order) ? override.order : index,
    };
  });
  return merged.sort((a, b) => a.order - b.order);
}

export function mergeFormIntro(formKey, override) {
  const def = DEFAULT_FORM_INTRO[formKey] || { kicker: '', heading: '', description: '' };
  return {
    kicker: override?.kicker || def.kicker,
    heading: override?.heading || def.heading,
    description: override?.description || def.description,
  };
}
