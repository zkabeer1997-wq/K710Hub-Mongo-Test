// Shared constants and helpers for the Flamedragon Tyrant Form (hero and troop lists come from the KvK form).

import { HEROES, PROFILE_UNIT_FIELDS, TROOP_TGS, TROOP_TIERS, KVK_ALLIANCES } from './playerCombatOptions.mjs';
import { sanitizeKvkTroops, sanitizeRequiredKvkTroops } from './kvkAvailability.mjs';
import { POWER_NUMBER_KEYS, checkPowerNumber, cleanCharmString, cleanGovernorGearString } from './powerProfiles.mjs';

// Heroes, troop tiers/TGs and alliances are the SAME lists as the KvK Availability form.
export { HEROES };
export const TIERS = TROOP_TIERS;
export const TGS = TROOP_TGS;
export const ALLIANCES = KVK_ALLIANCES;
export const UNIT_FIELDS = PROFILE_UNIT_FIELDS;

/** Drops heroes that are no longer in the shared list (old saved data is kept in the DB, just not offered). */
export function currentHeroesOnly(heroes, heroList = HEROES) {
  return Array.isArray(heroes) ? heroes.map(String).filter((hero) => heroList.includes(hero)) : [];
}

export const AVAILABILITY_OPTIONS = [
  '12-18 UTC (Full Battle)',
  'Unavailable',
  '12-15 UTC (First Half)',
  '15-18 UTC (Second Half)',
  'Intermittent',
];

export const VOICE_CHAT_OPTIONS = [
  'Yes',
  'Will be in the call without speaking',
  'No',
];

export const AUTO_HELP_OPTIONS = [
  'Yes',
  'No',
  'Can Purchase if needed',
];

// Charms, governor gear and Pet / Masters Power are the SAME fields as the Power Profile: one set of slots,
// serializers and validators (lib/powerProfiles.mjs), so a value saved on either form reads on the other.
export {
  CHARM_SLOTS,
  GOVERNOR_GEAR_SLOTS,
  CHARM_LEVEL_OPTIONS,
  GOVERNOR_GEAR_OPTIONS,
  blankCharmSelections,
  blankGovernorGearSelections,
  parseCharmSelections,
  parseGovernorGearSelections,
  serializeCharmSelections,
  serializeGovernorGearSelections,
} from './powerProfiles.mjs';

function clean(value) {
  return String(value || '').trim();
}

/** The power details this form shares with the member's Power Profile. */
export const SHARED_POWER_KEYS = ['governor_gear', 'charms', 'pet_power', 'masters_power'];

const isBlank = (value) => value == null || String(value).trim() === '';
const stamp = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

/**
 * Which gear / charms / Pet Power / Masters Power the Flamedragon form should start from. `answer` is the member's
 * Flamedragon row (this cycle's, else the latest earlier one; null when none), `profile` their power_profiles
 * document. Newest wins per field: a non-blank profile value replaces the form's answer when the profile was
 * saved after that answer (Power Profile or a scan changed it since), or when the form never had a value.
 * A blank profile value never wipes an answer. `from` is 'profile' when any field came from the profile.
 * @returns {{governor_gear: string, charms: string, pet_power: string, masters_power: string, from: 'answer'|'profile'|null}}
 */
export function resolvePowerPrefill({ answer, profile } = {}) {
  const profileNewer = stamp(profile?.updated_at) > stamp(answer?.updated_at);
  const out = { from: null };
  let usedProfile = false;
  let usedAnswer = false;
  for (const key of SHARED_POWER_KEYS) {
    const fromAnswer = isBlank(answer?.[key]) ? '' : clean(answer[key]);
    const fromProfile = isBlank(profile?.[key]) ? '' : clean(profile[key]);
    const useProfile = fromProfile && (!fromAnswer || profileNewer);
    out[key] = useProfile ? fromProfile : fromAnswer;
    if (useProfile) usedProfile = true;
    else if (fromAnswer) usedAnswer = true;
  }
  out.from = usedProfile ? 'profile' : usedAnswer ? 'answer' : null;
  return out;
}

export function sanitizeFlamedragonInput(input, { existingHeroes = [], allowedHeroes = HEROES, requireTroops = false } = {}) {
  // Same validation as KvK Availability. Removed heroes the member already had saved are dropped
  // silently so re-saving an old record never fails; newly chosen removed heroes are rejected.
  const stored = new Set(Array.isArray(existingHeroes) ? existingHeroes.map(String) : []);
  const troopInput = { ...input };
  if (Array.isArray(input.heroes)) {
    troopInput.heroes = input.heroes.filter((hero) => allowedHeroes.includes(clean(hero)) || !stored.has(clean(hero)));
  }
  const troops = (requireTroops ? sanitizeRequiredKvkTroops : sanitizeKvkTroops)(troopInput, { allowedHeroes, existingHeroes });
  if (troops.error) throw new Error(troops.error);
  const record = {
    name: clean(input.name),
    member_id: clean(input.member_id),
    current_alliance: clean(input.current_alliance),
    infantry_tier: troops.fields.infantry_tier || '',
    infantry_tg: troops.fields.infantry_tg || '',
    cavalry_tier: troops.fields.cavalry_tier || '',
    cavalry_tg: troops.fields.cavalry_tg || '',
    archer_tier: troops.fields.archer_tier || '',
    archer_tg: troops.fields.archer_tg || '',
    heroes: troops.fields.heroes || [],
    charms: cleanCharmString(input.charms),
    governor_gear: cleanGovernorGearString(input.governor_gear),
    // Pet / Masters Power follow the Power Profile rule: whole numbers 0..100,000,000 (commas allowed), optional.
    pet_power: '',
    masters_power: '',
    mystic_trial_score: clean(input.mystic_trial_score),
    availability: clean(input.availability),
    voice_chat: clean(input.voice_chat),
    auto_help: clean(input.auto_help),
    pin: clean(input.pin),
  };
  for (const key of POWER_NUMBER_KEYS) {
    const checked = checkPowerNumber(key, input[key]);
    if (!checked.ok) {
      const error = new Error(checked.error);
      error.field = key;
      throw error;
    }
    record[key] = checked.digits;
  }
  if (!record.name) throw new Error('Name is required.');
  if (!record.member_id) throw new Error('Member ID is required.');
  if (!record.pin) throw new Error('PIN is required.');
  return record;
}

export function publicFlamedragonRecord(record) {
  if (!record) return null;
  const { pin_hash, ...rest } = record;
  return rest;
}

/**
 * Merge-safe update: on an existing record only the fields present in the
 * request body are written, so a partial POST never nulls the others. A new
 * record still gets every field.  */
export function buildMergeSafePayload(fullPayload, body, existing) {
  if (!existing) return fullPayload;
  const payload = { member_id: fullPayload.member_id, updated_at: fullPayload.updated_at };
  for (const [key, value] of Object.entries(fullPayload)) {
    if (key in payload) continue;
    if (body && Object.prototype.hasOwnProperty.call(body, key)) payload[key] = value;
  }
  return payload;
}

