import { unstable_rethrow } from './rethrowNext.js';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { stripLegacyBearCopy } from './bearCopy.mjs';

// Return only public alliance information. Never expose admin/roster fields.
export async function loadPublicBearSchedule() {
  const coll = await getCollection(COLLECTIONS.ALLIANCES);
  const data = await coll
    .find({ active: { $ne: false } })
    .project({ tag: 1, name: 1, bear_times_utc: 1, updated_at: 1, sort_order: 1, _id: 0 })
    .sort({ sort_order: 1 })
    .toArray();
  return data || [];
}

export async function loadPublicBearScheduleOrNull() {
  try {
    return await loadPublicBearSchedule();
  } catch (error) {
    unstable_rethrow(error);
    console.error('Public Bear Hunt schedule unavailable', error);
    return null;
  }
}

export { stripLegacyBearCopy };

export function bearAllianceNotes(content) {
  return Object.fromEntries(
    ['710', 'RED', 'SKY'].map((tag, index) => [
      tag,
      stripLegacyBearCopy(content[`wb-${index + 1}-desc`]?.text || ''),
    ])
  );
}
