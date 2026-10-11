import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

// The Mystic Trial value a player's Kingshot sign-in stored on their kingshot_users row. This is the same
// number the member dashboard shows (session field `mysticTrial`). Reads never throw: no data = null.

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** @returns {Promise<number|null>} */
export async function loadLoginMystic(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return null;
  try {
    const users = await getCollection(COLLECTIONS.KINGSHOT_USERS);
    const user = await users.findOne({ player_id: id }, { projection: { mystic_trial: 1, _id: 0 } });
    return toNumber(user?.mystic_trial);
  } catch {
    return null;
  }
}

/** All sign-in Mystic Trial values at once, for admin lists. @returns {Promise<Map<string, number>>} */
export async function loadLoginMysticMap() {
  const out = new Map();
  try {
    const users = await getCollection(COLLECTIONS.KINGSHOT_USERS);
    const rows = await users.find({ mystic_trial: { $ne: null } }).project({ player_id: 1, mystic_trial: 1, _id: 0 }).toArray();
    for (const row of rows) {
      const n = toNumber(row.mystic_trial);
      if (n !== null) out.set(String(row.player_id), n);
    }
  } catch {
    /* admin lists keep the stored values */
  }
  return out;
}
