import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { hashMemberPin } from './mongoAuth.js';

/**
 * Member + power-profile helpers for the MongoDB test stack.
 * Mirrors the most-used Supabase queries against `submissions` and `power_profiles`.
 */

export async function findMemberById(memberId) {
  const clean = String(memberId || '').trim();
  if (!clean) return null;
  const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
  return coll.findOne({ member_id: clean });
}

export async function findMemberPublic(memberId) {
  const clean = String(memberId || '').trim();
  if (!clean) return null;
  const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
  return coll.findOne(
    { member_id: clean },
    {
      projection: {
        pin_hash: 0,
        current_alliance: 0,
      },
    }
  );
}

export async function listMembers({ projection } = {}) {
  const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
  const cursor = coll.find({}, projection ? { projection } : undefined).sort({ name: 1 });
  return cursor.toArray();
}

export async function upsertMember(data) {
  const cleanId = String(data.member_id || '').trim();
  if (!cleanId) throw new Error('member_id is required');

  const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
  const now = new Date();

  const update = {
    name: data.name,
    member_id: cleanId,
    infantry_tier: data.infantry_tier ?? null,
    infantry_tg: data.infantry_tg ?? null,
    cavalry_tier: data.cavalry_tier ?? null,
    cavalry_tg: data.cavalry_tg ?? null,
    archer_tier: data.archer_tier ?? null,
    archer_tg: data.archer_tg ?? null,
    heroes: Array.isArray(data.heroes) ? data.heroes : [],
    availability: data.availability ?? null,
    current_alliance: data.current_alliance ?? null,
    updated_at: now,
  };

  if (data.pin) {
    update.pin_hash = await hashMemberPin(data.pin);
  } else if (data.pin_hash) {
    update.pin_hash = data.pin_hash;
  }

  const result = await coll.findOneAndUpdate(
    { member_id: cleanId },
    {
      $set: update,
      $setOnInsert: { created_at: now },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return result;
}

export async function updateMemberPin(memberId, newPin) {
  const clean = String(memberId || '').trim();
  if (!clean || !newPin) throw new Error('member_id and pin are required');
  const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
  const pin_hash = await hashMemberPin(newPin);
  await coll.updateOne(
    { member_id: clean },
    { $set: { pin_hash, updated_at: new Date() } }
  );
}

// ---------- power profiles ----------

export async function findPowerProfile(memberId) {
  const clean = String(memberId || '').trim();
  if (!clean) return null;
  const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
  return coll.findOne({ member_id: clean });
}

export async function upsertPowerProfile(data) {
  const cleanId = String(data.member_id || '').trim();
  if (!cleanId) throw new Error('member_id is required');

  const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
  const now = new Date();

  const update = {
    member_id: cleanId,
    name: data.name,
    governor_gear: data.governor_gear ?? null,
    charms: data.charms ?? null,
    hero_gear: data.hero_gear ?? null,
    pet_power: data.pet_power ?? null,
    masters_power: data.masters_power ?? null,
    infantry_tier: data.infantry_tier ?? null,
    infantry_tg: data.infantry_tg ?? null,
    cavalry_tier: data.cavalry_tier ?? null,
    cavalry_tg: data.cavalry_tg ?? null,
    archer_tier: data.archer_tier ?? null,
    archer_tg: data.archer_tg ?? null,
    heroes: Array.isArray(data.heroes) ? data.heroes : [],
    updated_at: now,
  };

  return coll.findOneAndUpdate(
    { member_id: cleanId },
    { $set: update },
    { upsert: true, returnDocument: 'after' }
  );
}
