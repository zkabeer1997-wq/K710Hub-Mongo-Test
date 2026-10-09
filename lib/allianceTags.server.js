import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { LEGACY_ALLIANCE_TAGS } from './alliances.mjs';
import { acceptedAllianceTags, offeredAllianceTags } from './allianceTags.mjs';

/** Active alliances (tag, name, Bear Hunt times) in sort order; [] if the read fails. */
export async function loadActiveAllianceSummaries() {
  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const rows = await coll.find({ active: { $ne: false } }).project({ tag: 1, name: 1, bear_times_utc: 1, sort_order: 1, _id: 0 }).sort({ sort_order: 1 }).toArray();
    return (rows || []).filter((r) => r && r.tag);
  } catch (error) {
    console.error('active alliance read failed', error);
    return [];
  }
}

/** Tags the member forms offer. Falls back to the legacy three if the database read fails or is empty. */
export async function getOfferedAllianceTags() {
  const rows = await loadActiveAllianceSummaries();
  return rows.length ? offeredAllianceTags(rows.map((r) => r.tag)) : [...LEGACY_ALLIANCE_TAGS];
}

/** Tags a submission may carry (active + legacy). */
export async function getAcceptedAllianceTags() {
  const rows = await loadActiveAllianceSummaries();
  return acceptedAllianceTags(rows.map((r) => r.tag));
}
