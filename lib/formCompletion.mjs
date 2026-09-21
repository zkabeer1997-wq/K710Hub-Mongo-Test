/**
 * Pure helper for the Forms directory completion badges.
 *
 * Turns a submission timestamp (or its absence) into the short, accessible
 * label rendered on each form card. Kept dependency-free so it is easy to
 * unit test and safe to call from a Server Component.
 */

const MONTH_DAY_FORMAT = { month: 'short', day: 'numeric' };

/**
 * @param {string|number|Date|null|undefined} timestamp
 * @returns {string} "Completed Sep 15" when the timestamp parses to a valid
 *   date, otherwise "Not yet submitted".
 */
export function completionLabel(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') {
    return 'Not yet submitted';
  }
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Not yet submitted';
  }
  const formatted = new Intl.DateTimeFormat('en-US', MONTH_DAY_FORMAT).format(date);
  return `Completed ${formatted}`;
}

/**
 * @param {string|number|Date|null|undefined} timestamp
 * @returns {boolean} true when completionLabel would report a completion.
 */
export function isCompleted(timestamp) {
  return completionLabel(timestamp).startsWith('Completed');
}
