import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { allianceEventEntries } from './allianceEvents.mjs';

export async function loadPublicAllianceEvents() {
  const coll = await getCollection(COLLECTIONS.ALLIANCES);
  const data = await coll
    .find({ active: { $ne: false } })
    .project({ tag: 1, name: 1, scheduled_events: 1, sort_order: 1, _id: 0 })
    .sort({ sort_order: 1 })
    .toArray();
  return allianceEventEntries(data || []);
}

export async function loadPublicAllianceEventsOrNull() {
  try {
    return await loadPublicAllianceEvents();
  } catch (error) {
    console.error('Alliance events unavailable', error);
    return null;
  }
}
