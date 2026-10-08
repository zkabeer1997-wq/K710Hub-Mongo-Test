import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { createHeroCatalog } from './heroCatalog.mjs';

export * from './heroCatalog.mjs';

// Where a member's chosen hero names live (roster rows, Flamedragon rows, old Power Profile values).
const SAVED_IN = [COLLECTIONS.SUBMISSIONS, COLLECTIONS.FLAMEDRAGON_FORMS, COLLECTIONS.POWER_PROFILES];

/** Map of hero name -> number of stored form rows that list it. */
export async function savedHeroCounts() {
  const counts = new Map();
  for (const collection of SAVED_IN) {
    const coll = await getCollection(collection);
    const rows = await coll.find({ heroes: { $exists: true } }, { projection: { heroes: 1 } }).toArray();
    for (const row of rows) for (const name of Array.isArray(row.heroes) ? row.heroes : []) counts.set(String(name), (counts.get(String(name)) || 0) + 1);
  }
  return counts;
}

async function savedCount(name) { return (await savedHeroCounts()).get(name) || 0; }

// One catalog (and one 30 s cache) per server process.
const KEY = Symbol.for('k710.heroCatalog');
function catalog() {
  return (globalThis[KEY] ||= createHeroCatalog({ getColl: () => getCollection(COLLECTIONS.HERO_CATALOG), savedCount }));
}

export const getHeroCatalog = () => catalog();
export const getActiveHeroNames = () => catalog().activeNames();
export const getPublicHeroes = () => catalog().publicList();
export const invalidateHeroCatalog = () => catalog().invalidate();
