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
