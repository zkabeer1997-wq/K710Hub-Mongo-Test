import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getPageText } from './pageText.server.js';
import { resolveLeaders, usesLegacyLeaders } from './allianceLeaders.mjs';
import { orderAlliancesForLanding } from './alliances.mjs';
import { allianceImageUrl } from './allianceImages.mjs';

const PROJECTION = {
  tag: 1, name: 1, blurb: 1, leader_player_id: 1, leaders: 1, timezone_focus: 1,
  recruiting_status: 1, language: 1, roster_size: 1, bear_times_utc: 1, sort_order: 1, image_id: 1, image_alt: 1, _id: 0,
};

// The Home page text only matters until an alliance has its own `leaders` list.
async function legacyHomeText(rows) {
  if (!rows.some(usesLegacyLeaders)) return {};
  try { return await getPageText('home'); } catch { return {}; }
}

function publicShape(row, home) {
  const { leaders: _stored, ...rest } = row;
  // image_url is '' when there is no (valid) photo; the pages then show the no-photo look.
  return { ...rest, image_url: allianceImageUrl(row.image_id), image_alt: typeof row.image_alt === 'string' ? row.image_alt : '', legacy_leaders: usesLegacyLeaders(row), leaders: resolveLeaders(row, home) };
}

/** Active alliances for the public landing, in landing order. Throws if the database read fails. */
export async function loadLandingAlliances() {
  const coll = await getCollection(COLLECTIONS.ALLIANCES);
  const rows = (await coll.find({ active: true }).project(PROJECTION).sort({ sort_order: 1 }).toArray()) || [];
  const home = await legacyHomeText(rows);
  return orderAlliancesForLanding(rows.map((r) => publicShape(r, home)));
}

/** One active alliance (public shape) or null. */
export async function loadAllianceByTag(tagParam) {
  const coll = await getCollection(COLLECTIONS.ALLIANCES);
  const row = await coll.findOne({ tag: String(tagParam || '').toUpperCase(), active: true }, { projection: PROJECTION });
  if (!row) return null;
  return publicShape(row, await legacyHomeText([row]));
}
