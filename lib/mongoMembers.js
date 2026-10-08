import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

/** Member lookup helper for the MongoDB `submissions` collection. */
export async function findMemberById(memberId) {
  const clean = String(memberId || '').trim();
  if (!clean) return null;
  const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
  return coll.findOne({ member_id: clean });
}
