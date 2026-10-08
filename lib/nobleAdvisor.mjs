// Start times for Noble Advisor AND the KvK Prep Backpack (Days 1, 2, 4, 5): every 30 minutes
// beginning at 00:00 UTC (48 slots, 00:00 ... 23:30). The old Prep Backpack :15/:45 grid is gone;
// saved :15/:45 values are snapped to the earlier half hour on read (snapNobleSlot).
export const NOBLE_TIME_SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
export const TIME_SLOTS = NOBLE_TIME_SLOTS;

export const PREP_SLOT_KEYS = ['avail_day1', 'avail_day2', 'avail_day4', 'avail_day5'];

/** Snap the four slot lists of a saved Prep Backpack row (legacy :15/:45 -> :00/:30, duplicates merged). */
export function normalizePrepRowSlots(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of PREP_SLOT_KEYS) if (key in out) out[key] = normalizeNobleSlots(out[key]);
  return out;
}

/** Strict check for NEW input: every value must be on the :00/:30 grid. Returns {slots} or {error}. */
export function validatePrepSlots(value) {
  if (value == null || value === '') return { slots: [] };
  if (!Array.isArray(value)) return { error: 'Choose your times from the list.' };
  if (value.some((t) => !NOBLE_TIME_SLOTS.includes(String(t)))) {
    return { error: 'Choose valid UTC times (every 30 minutes, on the hour or half hour).' };
  }
  return { slots: [...new Set(value.map(String))] };
}

/**
 * Snap one stored slot onto the :00 / :30 grid. Legacy quarter-hour values round down to the
 * nearest earlier half hour (00:15 -> 00:00, 00:45 -> 00:30, 23:45 -> 23:30). Returns '' for
 * values that are not HH:MM at all.
 */
export function snapNobleSlot(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!m) return '';
  return `${m[1]}:${Number(m[2]) >= 30 ? '30' : '00'}`;
}

/** Snap a saved list of slots (legacy :15/:45 included), dropping duplicates created by snapping. */
export function normalizeNobleSlots(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(snapNobleSlot).filter(Boolean))];
}

export const NOBLE_FIELDS = ['in_game_name','want_troop_training','is_transfer','troop_speedup_days','promoting_t11','avail_day4'];
export function validateNobleAdvisor(input) {
 const record = Object.fromEntries(NOBLE_FIELDS.filter(k=>k!=='avail_day4').map(k=>[k,String(input?.[k] ?? '').trim()]));
 if (!record.in_game_name || record.in_game_name.length > 120) return { error: 'Enter your in-game name (up to 120 characters).' };
 if (!['Yes','No'].includes(record.want_troop_training)) return { error: 'Choose whether you want a Troop Training appointment.' };
 if (!['','Yes','No'].includes(record.is_transfer) || !['','Yes','No'].includes(record.promoting_t11)) return { error: 'Choose Yes or No for transfer and T11 promotion.' };
 const days = record.troop_speedup_days.replace(/[,\s+]/g,'');
 if (days && (!/^\d+(\.\d+)?$/.test(days) || Number(days)>100000)) return { error: 'Enter a valid number of speedup days.' };
 record.troop_speedup_days = days;
 if (!Array.isArray(input?.avail_day4) || input.avail_day4.some(t=>!NOBLE_TIME_SLOTS.includes(t))) return { error: 'Choose valid UTC appointment times (every 30 minutes, on the hour or half hour).' };
 record.avail_day4 = [...new Set(input.avail_day4)];
 if (record.want_troop_training === 'Yes' && (!days || !record.is_transfer || !record.promoting_t11 || !record.avail_day4.length)) return { error: 'Complete the training questions and choose at least one available time.' };
 return { record };
}
