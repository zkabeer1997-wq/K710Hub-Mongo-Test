// Server-only reads for the Forms directory completion badges.
//
// Reuses the same collections the individual form GET routes already query
// (see app/api/power-profile, app/api/kvk-availability, app/api/flamedragon)
// instead of adding new indexes or shapes. Defensive by design: any Mongo
// failure (including MONGODB_URI not configured) falls back to an all-null
// map so the Forms page always renders, with every card showing
// "Not yet submitted".
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

const EMPTY_COMPLETIONS = {
  lead: null,
  'kvk-hub': null,
  'dragon-hub': null,
  requests: null,
};

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * @param {string} memberId
 * @returns {Promise<{lead: string|null, 'kvk-hub': string|null, 'dragon-hub': string|null, requests: string|null}>}
 *   ISO timestamp of the member's latest submission for each Forms
 *   directory card, or null when there is none / it could not be read.
 */
export async function getMemberFormCompletions(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return { ...EMPTY_COMPLETIONS };

  try {
    const [powerProfiles, submissions, flamedragonForms, websiteRequests] = await Promise.all([
      getCollection(COLLECTIONS.POWER_PROFILES),
      getCollection(COLLECTIONS.SUBMISSIONS),
      getCollection(COLLECTIONS.FLAMEDRAGON_FORMS),
      getCollection(COLLECTIONS.WEBSITE_REQUESTS),
    ]);

    const [powerRow, kvkRow, dragonRow, requestRow] = await Promise.all([
      powerProfiles.findOne(
        { member_id: id },
        { projection: { updated_at: 1, _id: 0 } }
      ),
      submissions.findOne(
        { member_id: id, availability: { $exists: true, $nin: [null, ''] } },
        { projection: { updated_at: 1, _id: 0 } }
      ),
      flamedragonForms.findOne(
        { member_id: id },
        { projection: { updated_at: 1, _id: 0 }, sort: { updated_at: -1 } }
      ),
      websiteRequests.findOne(
        { member_id: id },
        { projection: { created_at: 1, _id: 0 }, sort: { created_at: -1 } }
      ),
    ]);

    return {
      lead: toIso(powerRow?.updated_at),
      'kvk-hub': toIso(kvkRow?.updated_at),
      'dragon-hub': toIso(dragonRow?.updated_at),
      requests: toIso(requestRow?.created_at),
    };
  } catch {
    return { ...EMPTY_COMPLETIONS };
  }
}
