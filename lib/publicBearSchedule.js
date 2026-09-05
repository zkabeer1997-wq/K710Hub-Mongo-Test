import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

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
    console.error('Public Bear Hunt schedule unavailable', error);
    return null;
  }
}

// Remove only the site's old stock schedule descriptions, preserving
// leadership notes and other admin-written text after those paragraphs.
export function stripLegacyBearCopy(text = '') {
  const stock = [
    'Two Bear Hunts each day.',
    'Three Bear Hunts each day.',
    'Two hunts a day, anchoring the early and midday windows.',
    'Three hunts, running from EU evening through NA late night.',
    'Two hunts anchoring the SEA / AU daytime window.',
  ];
  for (const sentence of stock) text = text.replace(sentence, '');
  return text.trim();
}

export function bearAllianceNotes(content) {
  return Object.fromEntries(
    ['710', 'RED', 'SKY'].map((tag, index) => [
      tag,
      stripLegacyBearCopy(content[`wb-${index + 1}-desc`]?.text || ''),
    ])
  );
}
