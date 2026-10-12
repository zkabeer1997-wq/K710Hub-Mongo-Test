import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { buildTroopProfileSet } from './kvkAvailability.mjs';

/**
 * Remember a member's troop tier/TG and heroes on their profile document (power_profiles, keyed by
 * member_id) whenever they save the KvK Availability or Flamedragon Tyrant form, whether or not they
 * ever use the Power Profile form. Writes ONLY the troop/hero fields present in `fields` (plus
 * troop_updated_at) with $set, so governor_gear, charms, hero_gear, pet_power, masters_power,
 * mystic_trial_score and the Power Profile's own updated_at are never touched. A document created
 * here holds just member_id + those fields (no name, no updated_at), so it does not count as a
 * filled-in Power Profile (see powerProfileDoneAt).
 */
export async function saveTroopsToProfile(memberId, fields, now = new Date()) {
  const id = String(memberId || '').trim();
  const set = buildTroopProfileSet(fields, now);
  if (!id || !set) return false;
  const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
  await coll.updateOne({ member_id: id }, { $set: set, $setOnInsert: { member_id: id } }, { upsert: true });
  return true;
}

const LOADOUT_KEYS = ['governor_gear', 'charms', 'pet_power', 'masters_power'];

/**
 * Write the power details a member saved on the Flamedragon form (already validated by
 * sanitizeFlamedragonInput) onto their Power Profile, so they only enter them once. Writes ONLY the
 * governor_gear, charms, pet_power and masters_power keys present in `fields` (a blank value clears that
 * field, like the Power Profile does), plus updated_at; every other profile field (hero_gear, troops,
 * heroes, mystic_trial_score, ...) is left alone. Mystic Trial is never written from here: it always
 * comes from the member's sign-in. With no profile yet the document is created with the member's name;
 * a document that only held remembered troops gets its name filled in. Not gated: it runs inside the
 * Flamedragon save, which is already gated by the 'dragon' form.
 * @returns {Promise<boolean>} false when there was nothing to write
 */
export async function saveLoadoutToProfile(memberId, fields, { now = new Date(), name = '' } = {}) {
  const id = String(memberId || '').trim();
  if (!id || !fields || typeof fields !== 'object') return false;
  const set = {};
  for (const key of LOADOUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) set[key] = String(fields[key] || '').trim() || null;
  }
  if (!Object.keys(set).length) return false;
  set.updated_at = now;
  const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
  const existing = await coll.findOne({ member_id: id }, { projection: { member_id: 1, name: 1 } });
  const cleanName = String(name || '').trim();
  if (cleanName && !String(existing?.name || '').trim()) set.name = cleanName;
  await coll.updateOne({ member_id: id }, { $set: set, $setOnInsert: { member_id: id } }, { upsert: true });
  return true;
}
