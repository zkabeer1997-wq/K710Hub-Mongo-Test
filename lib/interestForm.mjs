// Pure helpers for the /interest (transfer application) form. Framework-free
// so they can be unit tested and shared by the client form and the API route.

const SUFFIX = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * Parses a number typed by a person: "12345678", "12,345,678", "12 345 678",
 * "12.345.678", "12.3M", "12m", "12,3 M", "450k".
 * Returns { ok, value, digits } - `digits` is a plain digit string ("12300000")
 * that is safe to store. Empty input gives { ok: false, empty: true }.
 */
export function parseNumberInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, empty: true, value: null, digits: '' };
  const text = raw.replace(/[\s _']/g, '').toLowerCase();

  const suffixMatch = text.match(/^(\d+(?:[.,]\d+)?)([kmb])$/);
  if (suffixMatch) {
    const base = Number(suffixMatch[1].replace(',', '.'));
    const value = Math.round(base * SUFFIX[suffixMatch[2]]);
    if (Number.isFinite(value) && value >= 0) return { ok: true, value, digits: String(value) };
    return { ok: false, value: null, digits: '' };
  }

  let digits = '';
  if (/^\d+$/.test(text)) digits = text;
  else if (/^\d{1,3}(,\d{3})+$/.test(text) || /^\d{1,3}(\.\d{3})+$/.test(text)) digits = text.replace(/[.,]/g, '');
  else return { ok: false, value: null, digits: '' };

  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return { ok: false, value: null, digits: '' };
  return { ok: true, value, digits: String(value) };
}

// ---- Numeric answers with limits -----------------------------------------
// Keyed by the stored (snake_case) field name. `suffix` = whether 12.3M / 450k /
// 3b shortcuts are accepted. Mystic Trial stages are small whole numbers, so a
// "k" there is NOT thousands: plain integers only.
export const NUMERIC_RULES = Object.freeze({
  total_power: { label: 'Total power', min: 1, max: 3_000_000_000, suffix: true },
  mystic_trial_stages: { label: 'Mystic Trial stages', min: 0, max: 4000, suffix: false },
  current_server: { label: 'Current server number', min: 250, max: 1100, suffix: false },
  current_tg: { label: 'TrueGold (TG)', min: 0, max: 10_000_000_000, suffix: true },
  passes_required: { label: 'Transfer passes you need', min: 0, max: 100_000, suffix: false },
  current_passes: { label: 'Transfer passes you have now', min: 0, max: 100_000, suffix: false },
});

/** Longest text a number box accepts (a 30-digit paste is cut off here). */
export const NUMBER_INPUT_MAX_LENGTH = 16;
/** The server number is 3 or 4 digits (250-1100). */
export const SERVER_INPUT_MAX_LENGTH = 4;

/** Plain-language names for every required answer (used in server error messages). */
export const REQUIRED_FIELD_LABELS = Object.freeze({
  in_game_name: 'In-game name',
  player_id: 'Player ID',
  discord_username: 'Discord username',
  current_server: 'Current server number',
  current_alliance: 'Current alliance',
  migrate_alliance: 'Alliance you want to join',
  highest_troop_level: 'Highest troop level',
  current_tg: 'TrueGold (TG)',
  t11_units: 'T11 troops',
  mystic_trial_stages: 'Mystic Trial stages',
  total_power: 'Total power',
  willing_reduce_power: 'Would you lower your power if needed',
  passes_required: 'Transfer passes you need',
  current_passes: 'Transfer passes you have now',
  active_commit: 'Active in alliance events',
  willing_save_resources: 'Saves resources for KvK prep',
  participates_battles: 'Joins Sanctuary, Castle and KvK battles',
  spending_archetype: 'Spending style',
  main_language: 'Main language',
});

/**
 * Parses and range-checks one numeric answer.
 * Returns { ok, empty?, value, digits, error }. `error` is a plain message.
 */
export function validateNumericAnswer(field, input) {
  const rule = NUMERIC_RULES[field];
  const raw = String(input ?? '').trim();
  if (!rule) return { ok: false, value: null, digits: '', error: 'Unknown number field.' };
  const maxText = formatWithCommas(rule.max);
  const serverRange = 'Current server number must be a whole number from 250 to 1,100. Check the number in your game and try again.';
  const overMessage = field === 'current_server' ? serverRange : field === 'total_power'
    ? 'Total power cannot be more than 3,000,000,000. Check the number and try again.'
    : field === 'mystic_trial_stages'
      ? 'Mystic Trial stages cannot be more than 4,000.'
      : `${rule.label} cannot be more than ${maxText}. Check the number and try again.`;
  if (!raw) return { ok: false, empty: true, value: null, digits: '', error: '' };

  const compact = raw.replace(/[\s _']/g, '').toLowerCase();
  if (!rule.suffix && /[kmb]$/.test(compact) && /^\d/.test(compact)) {
    return { ok: false, value: null, digits: '', error: `${rule.label}: type a whole number such as 120. Letters like k or m are not used here.` };
  }
  const parsed = parseNumberInput(raw);
  if (!parsed.ok) {
    // A very long run of digits is "too big", not "not a number".
    if (/^[\d.,]+$/.test(compact) && compact.replace(/\D/g, '').length > 15) {
      return { ok: false, value: null, digits: '', error: overMessage };
    }
    return {
      ok: false, value: null, digits: '',
      error: field === 'current_server' ? 'Please type numbers only, for example 512.' : rule.suffix ? 'Please type a number, for example 12,345,678 or 12.3M.' : `Please type a whole number, for example ${field === 'mystic_trial_stages' ? '120' : '5'}.`,
    };
  }
  if (parsed.value > rule.max) return { ok: false, value: parsed.value, digits: '', error: overMessage };
  if (parsed.value < rule.min) {
    if (field === 'current_server') return { ok: false, value: parsed.value, digits: '', error: serverRange };
    return { ok: false, value: parsed.value, digits: '', error: `${rule.label} must be more than 0. Check the number and try again.` };
  }
  return { ok: true, value: parsed.value, digits: parsed.digits, error: '' };
}

/** 12300000 -> "12,300,000" (fixed locale so server and browser agree). */
export function formatWithCommas(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return '';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * What to show under a number field as the person types.
 * Returns '' when nothing is useful to say (empty or already plain digits
 * without commas would still be echoed with commas for easy checking).
 */
export function numberPreview(input, field) {
  if (field && NUMERIC_RULES[field]) {
    const checked = validateNumericAnswer(field, input);
    if (checked.empty) return '';
    return checked.ok ? `You typed: ${formatWithCommas(checked.value)}` : checked.error;
  }
  const parsed = parseNumberInput(input);
  if (!parsed.ok) return '';
  return `You typed: ${formatWithCommas(parsed.value)}`;
}

/** Strips a leading @, spaces around, and zero-width characters from a Discord name. */
export function normalizeDiscordUsername(input) {
  return String(input ?? '')
    .replace(/[​-‍﻿]/g, '')
    .trim()
    .replace(/^@+/, '')
    .trim();
}

/** Player ID: digits only (people paste "ID: 123 456"). */
export function normalizePlayerId(input) {
  return String(input ?? '').replace(/\D+/g, '');
}

/** Live hint for the Player ID field. */
export function playerIdHint(input) {
  const raw = String(input ?? '');
  if (!raw.trim()) return '';
  if (/\D/.test(raw.replace(/\s/g, ''))) return 'Numbers only. We will remove the other characters.';
  return '';
}

/** Collapses repeated spaces and trims a free-text answer. */
export function cleanText(input) {
  return String(input ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalises a numeric answer for storage; keeps text we cannot parse so validation can report it. */
export function normalizeNumericAnswer(input, field) {
  if (field && NUMERIC_RULES[field]) {
    const checked = validateNumericAnswer(field, input);
    return checked.ok ? checked.digits : String(input ?? '').trim();
  }
  const parsed = parseNumberInput(input);
  return parsed.ok ? parsed.digits : String(input ?? '').trim();
}

// ---- Draft prompt ("Continue where you left off?") -----------------------

/** Fields that count as "the person really started" (ignores empty arrays/strings). */
export function draftFilledCount(data) {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (key === 'website') continue;
    if (Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '') count += 1;
  }
  return count;
}

/** Reads { savedAt } from the serialised draft envelope without validating the data. */
export function readDraftSavedAt(raw) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.savedAt === 'number' ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

/** Offer the resume prompt only when at least two answers were saved. */
export function shouldOfferResume(data) {
  return draftFilledCount(data) >= 2;
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function describeAge(savedAt, now = Date.now()) {
  if (typeof savedAt !== 'number') return '';
  const minutes = Math.max(0, Math.round((now - savedAt) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "84 KB" / "1.2 MB" for the screenshot list. */
export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Status page wording -------------------------------------------------

export const STATUS_COPY = Object.freeze({
  pending: {
    title: 'Waiting for review',
    body: 'We received your application. An officer has not looked at it yet, or is still deciding.',
    next: 'Nothing to do now. Keep your Discord messages open (check “Message requests” too). We contact you there.',
  },
  accepted: {
    title: 'Accepted',
    body: 'Good news. Leadership accepted your application.',
    next: 'Check your Discord messages for the next steps, then sign in here with your Kingshot Player ID.',
  },
  waitlist: {
    title: 'On the waiting list',
    body: 'We liked your application but there is no free place right now.',
    next: 'You do not need to apply again. We will message you on Discord when a place opens.',
  },
  rejected: {
    title: 'Not this time',
    body: 'We could not offer you a place in this round.',
    next: 'You are welcome to apply again in a later intake window.',
  },
});

export function statusCopy(status) {
  return STATUS_COPY[status] || STATUS_COPY.pending;
}
