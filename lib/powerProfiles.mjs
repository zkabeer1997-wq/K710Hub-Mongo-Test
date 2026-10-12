export const POWER_PROFILE_FIELDS = [
 { key: 'pet_power', label: 'Pet Power' },
 { key: 'masters_power', label: 'Masters Power' },
 { key: 'mystic_trial_score', label: 'Mystic Trial Total Score' },
];

import { formatWithCommas, validateNumericAnswer } from './interestForm.mjs';
import { CHARM_LEVEL_OPTIONS as CHARM_OK_LIST, GOVERNOR_GEAR_OPTIONS as GEAR_OK_LIST } from './equipmentOptions.mjs';

export { CHARM_LEVEL_OPTIONS, GOVERNOR_GEAR_OPTIONS } from './equipmentOptions.mjs';
export { HEROES, PROFILE_UNIT_FIELDS, TROOP_TGS, TROOP_TIERS } from './playerCombatOptions.mjs';

export const GOVERNOR_GEAR_SLOTS = [
 { key: 'infantry_1', label: 'Infantry 1' },
 { key: 'infantry_2', label: 'Infantry 2' },
 { key: 'archer_1', label: 'Archer 1' },
 { key: 'archer_2', label: 'Archer 2' },
 { key: 'cavalry_1', label: 'Cavalry 1' },
 { key: 'cavalry_2', label: 'Cavalry 2' },
];

function charmSlotsForType(type) {
 const labelPrefix = type[0].toUpperCase() + type.slice(1);
 return Array.from({ length: 6 }, (_, index) => ({
 key: `${type}_${index + 1}`,
 label: `${labelPrefix} Charm ${index + 1}`,
 }));
}

export const CHARM_SLOTS = [
 ...charmSlotsForType('archer'),
 ...charmSlotsForType('infantry'),
 ...charmSlotsForType('cavalry'),
];

function clean(value) {
 return String(value || '').trim();
}

// Pet Power and Masters Power are plain whole numbers the member types (digits, commas allowed: 1,500,000),
// from 0 to 100,000,000. Letters such as k or m are not accepted. Optional. Stored as plain digits ("1500000").
export const POWER_NUMBER_RULES = Object.freeze({
 pet_power: { label: 'Pet Power', min: 0, max: 100_000_000, suffix: false },
 masters_power: { label: 'Masters Power', min: 0, max: 100_000_000, suffix: false },
});
export const POWER_NUMBER_KEYS = Object.keys(POWER_NUMBER_RULES);

/**
 * Checks one typed Pet/Masters Power value. Empty is fine (the field is optional).
 * @returns {{ok: boolean, empty?: boolean, digits: string, error: string}}
 */
export function checkPowerNumber(field, input) {
 const checked = validateNumericAnswer(field, input, POWER_NUMBER_RULES);
 if (checked.empty) return { ok: true, empty: true, digits: '', error: '' };
 if (checked.ok) return { ok: true, digits: checked.digits, error: '' };
 const label = POWER_NUMBER_RULES[field].label;
 const message = checked.value != null && checked.value > POWER_NUMBER_RULES[field].max
   ? `${label} cannot be more than 100,000,000. Check the number and try again.`
   : `${label}: type a whole number from 0 to 100,000,000, for example 1,500,000. Letters like k or m are not used here.`;
 return { ok: false, digits: '', error: message };
}

/** Errors for every Pet/Masters Power value in `values`: [{key, message}] (empty list = all good). */
export function powerNumberErrors(values) {
 const found = [];
 for (const key of POWER_NUMBER_KEYS) {
 const checked = checkPowerNumber(key, values && values[key]);
 if (!checked.ok) found.push({ key, message: checked.error });
 }
 return found;
}

/** What to show in the box for a stored value: digits get thousands separators, anything else stays as typed. */
export function displayPowerNumber(value) {
 const text = clean(value);
 if (!text) return '';
 const checked = validateNumericAnswer('pet_power', text, POWER_NUMBER_RULES);
 return checked.ok ? formatWithCommas(checked.value) : text;
}

/**
 * Which Mystic Trial value a Power Profile carries. The player's Kingshot sign-in data is the source of
 * truth (it is what the dashboard shows), so a login value always wins over anything saved or typed
 * earlier. With no login value the previously saved value is kept (never blanked by a save).
 * @param {{login: number|string|null|undefined, saved: string|number|null|undefined}} input
 * @returns {{value: string, source: 'login'|'saved'|'none'}}
 */
export function resolveMysticScore({ login, saved } = {}) {
 const n = login === null || login === undefined || login === '' ? NaN : Number(login);
 if (Number.isFinite(n) && n >= 0) return { value: String(Math.round(n)), source: 'login' };
 const kept = clean(saved);
 return kept ? { value: kept, source: 'saved' } : { value: '', source: 'none' };
}

export function blankGovernorGearSelections() {
 return Object.fromEntries(GOVERNOR_GEAR_SLOTS.map((slot) => [slot.key, '']));
}

export function serializeGovernorGearSelections(selections) {
 return GOVERNOR_GEAR_SLOTS
 .map((slot) => {
 const value = clean(selections && selections[slot.key]);
 return value ? `${slot.label}: ${value}` : '';
 })
 .filter(Boolean)
 .join(' | ');
}

export function parseGovernorGearSelections(value) {
 const selections = blankGovernorGearSelections();
 const labelsByKey = new Map(GOVERNOR_GEAR_SLOTS.map((slot) => [slot.label, slot.key]));

 String(value || '').split('|').forEach((part) => {
 const [rawLabel, ...rawValue] = part.split(':');
 const key = labelsByKey.get(clean(rawLabel));
 if (key) selections[key] = clean(rawValue.join(':'));
 });

 return selections;
}

export function blankCharmSelections() {
 return Object.fromEntries(CHARM_SLOTS.map((slot) => [slot.key, '']));
}

export function serializeCharmSelections(selections) {
 return CHARM_SLOTS
 .map((slot) => {
 const value = clean(selections && selections[slot.key]);
 return value ? `${slot.label}: ${value}` : '';
 })
 .filter(Boolean)
 .join(' | ');
}

export function parseCharmSelections(value) {
 const selections = blankCharmSelections();
 const labelsByKey = new Map(CHARM_SLOTS.map((slot) => [slot.label, slot.key]));

 String(value || '').split('|').forEach((part) => {
 const [rawLabel, ...rawValue] = part.split(':');
 const key = labelsByKey.get(clean(rawLabel));
 if (key) selections[key] = clean(rawValue.join(':'));
 });

 return selections;
}

const GEAR_OK = new Set(GEAR_OK_LIST);
const CHARM_OK = new Set(CHARM_OK_LIST);

function cleanSelections(parsed, slots, allowed, what) {
 const out = {};
 for (const slot of slots) {
 const value = parsed[slot.key] || '';
 if (value && !allowed.has(value)) throw new Error(`"${value}" is not a valid ${what}.`);
 out[slot.key] = value;
 }
 return out;
}

/** Checks a stored Governor Gear string against the allowed values and returns it in the canonical form. Throws a member-safe message on a bad value. */
export function cleanGovernorGearString(value) {
 return serializeGovernorGearSelections(cleanSelections(parseGovernorGearSelections(value), GOVERNOR_GEAR_SLOTS, GEAR_OK, 'gear value'));
}

/** Same for the charms string. */
export function cleanCharmString(value) {
 return serializeCharmSelections(cleanSelections(parseCharmSelections(value), CHARM_SLOTS, CHARM_OK, 'charm level'));
}

// Same grouping the member dashboard uses for the Mystic Trial figure.
export const formatCount = (value) => (value == null || value === '' || Number.isNaN(Number(value)) ? String(value || '') : new Intl.NumberFormat().format(Number(value)));

/** i18n key of the small note under the read-only Mystic Trial number, for a resolveMysticScore source. */
export function mysticNoteKey(source) {
 return source === 'login' ? 'profile.mystic.login' : source === 'saved' ? 'profile.mystic.saved' : 'profile.mystic.missing';
}

export function sanitizePowerProfileInput(input) {
 const profile = {
 name: clean(input.name),
 member_id: clean(input.member_id),
 governor_gear: clean(input.governor_gear),
 charms: clean(input.charms),
 hero_gear: clean(input.hero_gear),
 pet_power: '',
 masters_power: '',
 // Never typed by the member: the route fills it from the sign-in data (see resolveMysticScore).
 mystic_trial_score: '',
 };
 for (const key of POWER_NUMBER_KEYS) {
 const checked = checkPowerNumber(key, input[key]);
 if (!checked.ok) {
 const error = new Error(checked.error);
 error.field = key;
 throw error;
 }
 profile[key] = checked.digits;
 }
 // Troop levels and heroes are no longer part of the Power Profile (see lib/kvkAvailability.mjs).

 if (!profile.name) throw new Error('Name is required.');
 if (!profile.member_id) throw new Error('Member ID is required.');

 return profile;
}

export function publicPowerProfile(profile) {
 if (!profile) return null;

 return {
 member_id: String(profile.member_id),
 name: profile.name || '',
 governor_gear: profile.governor_gear || '',
 charms: profile.charms || '',
 hero_gear: profile.hero_gear || '',
 pet_power: profile.pet_power || '',
 masters_power: profile.masters_power || '',
 mystic_trial_score: profile.mystic_trial_score || '',
 infantry_tier: profile.infantry_tier || '',
 infantry_tg: profile.infantry_tg || '',
 cavalry_tier: profile.cavalry_tier || '',
 cavalry_tg: profile.cavalry_tg || '',
 archer_tier: profile.archer_tier || '',
 archer_tg: profile.archer_tg || '',
 heroes: Array.isArray(profile.heroes) ? profile.heroes.map(String) : [],
 updated_at: profile.updated_at || null,
 };
}

export function mergePowerProfilesIntoRows(rows, powerProfiles, loginMystic = null) {
 const profilesByMemberId = new Map(
 (powerProfiles || []).map((profile) => [String(profile.member_id), publicPowerProfile(profile)]),
 );

 return rows.map((row) => {
 const powerProfile = profilesByMemberId.get(String(row.member_id)) || null;
 const eventUpdatedAt = Date.parse(row.updated_at || '');
 const profileUpdatedAt = Date.parse(powerProfile?.updated_at || '');
 const latestUpdatedAt = Number.isFinite(profileUpdatedAt)
 && (!Number.isFinite(eventUpdatedAt) || profileUpdatedAt > eventUpdatedAt)
 ? powerProfile.updated_at
 : row.updated_at;
 // Troop levels and heroes are per-cycle answers on the event row. The old Power Profile values
 // only fill what the row lacks (members who have not re-entered them on the KvK form yet).
 const troop = (key) => row[key] || powerProfile?.[key] || row[key];
 const heroes = Array.isArray(row.heroes) && row.heroes.length ? row.heroes : (powerProfile?.heroes || row.heroes);
 return {
 ...row,
 name: powerProfile?.name || row.name,
 infantry_tier: troop('infantry_tier'),
 infantry_tg: troop('infantry_tg'),
 cavalry_tier: troop('cavalry_tier'),
 cavalry_tg: troop('cavalry_tg'),
 archer_tier: troop('archer_tier'),
 archer_tg: troop('archer_tg'),
 heroes,
 governor_gear: powerProfile?.governor_gear || row.governor_gear,
 charms: powerProfile?.charms || row.charms,
 hero_gear: powerProfile?.hero_gear || row.hero_gear,
 pet_power: powerProfile?.pet_power || row.pet_power,
 masters_power: powerProfile?.masters_power || row.masters_power,
 // The sign-in value (what the dashboard shows) wins over the stored one, like on the member's own review.
 mystic_trial_score: resolveMysticScore({ login: loginMystic?.get(String(row.member_id)), saved: powerProfile?.mystic_trial_score || row.mystic_trial_score }).value,
 updated_at: latestUpdatedAt,
 event_updated_at: row.updated_at || null,
 player_profile_updated_at: powerProfile?.updated_at || null,
 power_profile: powerProfile,
 };
 });
}

const OWN_FIELD_KEYS = ['governor_gear', 'charms', 'hero_gear', 'pet_power', 'masters_power', 'mystic_trial_score'];

/**
 * When the member filled in the POWER PROFILE form (the "lead" form), judged from the stored
 * power_profiles document, or null when they have not. A document that only holds troop tier/TG and
 * heroes (remembered from the KvK / Flamedragon forms: troop_updated_at but no updated_at) does NOT
 * count. Legacy documents count when they carry a save time or any Power Profile field.
 * @returns {Date|string|null}
 */
export function powerProfileDoneAt(doc) {
 if (!doc || typeof doc !== 'object') return null;
 const stamp = doc.updated_at || doc.created_at;
 if (stamp) return stamp;
 const hasField = OWN_FIELD_KEYS.some((key) => String(doc[key] == null ? '' : doc[key]).trim() !== '');
 return hasField ? new Date(0) : null;
}
