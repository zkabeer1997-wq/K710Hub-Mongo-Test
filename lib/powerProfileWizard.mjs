// Pure, framework-free helpers for the Power Profile wizard
// (app/power-profile/PowerProfileClient.js). Presentational only - nothing
// here touches the form/governorGear/charms state shape, the
// serializeGovernorGearSelections/serializeCharmSelections formats, or the
// /api/power-profile request/response contract. Kept in a plain .mjs file
// (rather than inline in the client component) so it can be unit tested
// with `node --test` without a React/DOM harness.

/**
 * Turns a hero display name into the slug used for an optional portrait
 * image, e.g. "Long Fei" -> "long-fei". Lowercases and replaces runs of
 * whitespace with a single hyphen; anything falsy yields ''.
 */
export function heroSlug(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Derives the wizard's persistent save-status line from existing
 * loading/status/isError state plus a presentational-only `dirty` flag
 * (true once a field has changed since the last successful save). Never
 * reads or writes the submit payload - purely a label for the UI.
 */
export function saveStatusLabel({ loading, isError, dirty, status }) {
  if (loading) return 'Saving…';
  if (isError) return status || 'Save failed';
  if (dirty) return 'Unsaved changes';
  if (status) return 'All changes saved';
  return '';
}

/** Clamps a requested step index into the valid [0, stepCount - 1] range. */
export function clampStep(index, stepCount) {
  if (!Number.isFinite(index)) return 0;
  if (index < 0) return 0;
  if (index > stepCount - 1) return stepCount - 1;
  return index;
}
