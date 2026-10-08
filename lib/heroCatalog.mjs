// Hero catalog: the one list of heroes shown on the KvK Availability AND Flamedragon forms.
// Pure and injectable (no Next, no Mongo import); lib/heroCatalog.server.js binds it to MongoDB.
//
// Stored form answers keep the hero NAME string (never a key or image id), so the catalog never
// migrates data. Renaming a hero that anybody saved is blocked (see assertRenameAllowed).
// Reads are cached ~30 s with explicit invalidation after admin writes, and FAIL OPEN to the
// built-in defaults (lib/playerCombatOptions.mjs) when MongoDB is unavailable.
import { HEROES } from './playerCombatOptions.mjs';
// Client-safe module (the member forms import it): keep it free of node-only imports.
// Same-origin proxy URL, identical to siteImageUrl() in lib/siteImages.mjs.
const siteImageUrl = (id) => `/api/site-image/${id}`;

// Heroes that used to be offered and were switched off on purpose. Seeded inactive so an admin can re-enable them.
export const REMOVED_HEROES = ['Yeonwoo', 'Amadeus', 'Vivian', 'Margot', 'Alcar', 'Long Fei', 'Sophia', 'Zoe', 'Jaeger', 'Rosa'];
// Static portraits that ship in public/heroes/<key>.webp (the default image when no Drive image is set).
export const STATIC_HERO_KEYS = Object.freeze([...HEROES, ...REMOVED_HEROES].map((name) => heroKey(name)));

export const HERO_NAME_MAX = 30;
export const CATALOG_TTL_MS = 30_000;

/** Stable slug used as the catalog key and the static image file name ("Long Fei" -> "long-fei"). */
export function heroKey(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export class HeroCatalogError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.name = 'HeroCatalogError'; this.status = status; Object.assign(this, extra); }
}

/** Normalises a typed name; throws a plain-language HeroCatalogError. */
export function cleanHeroName(raw) {
  const name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!name) throw new HeroCatalogError('Enter the hero name.');
  if (name.length > HERO_NAME_MAX) throw new HeroCatalogError(`Hero names can be at most ${HERO_NAME_MAX} characters.`);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '.-]*$/u.test(name) || !heroKey(name)) throw new HeroCatalogError('Use letters, numbers, spaces, apostrophes, dots or hyphens in the hero name.');
  return name;
}

export function staticImageUrl(key) { return STATIC_HERO_KEYS.includes(key) ? `/heroes/${key}.webp` : null; }

/** The built-in list as catalog documents (what lazy seeding inserts and what fail-open serves). */
export function defaultCatalogDocs(now = new Date()) {
  const rows = [...HEROES.map((name) => ({ name, active: true })), ...REMOVED_HEROES.map((name) => ({ name, active: false }))];
  return rows.map((row, order) => ({
    key: heroKey(row.name), name: row.name, image: null, active: row.active, order,
    created_at: now, updated_at: now, updated_by: 'seed',
  }));
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name));

/** Browser-safe hero: never exposes Drive ids (the image is the same-origin proxy URL). */
export function publicHero(doc) {
  const imageId = doc?.image?.site_image_id || null;
  return {
    key: doc.key, name: doc.name,
    image_url: imageId ? siteImageUrl(imageId) : null,
    default_url: staticImageUrl(doc.key),
  };
}
export const publicHeroes = (docs) => (docs || []).filter((d) => d.active).sort(byOrder).map(publicHero);
export const activeHeroNames = (docs) => (docs || []).filter((d) => d.active).sort(byOrder).map((d) => d.name);

/** Admin shape: everything, still without Drive ids. */
export function adminHero(doc) {
  return { ...publicHero(doc), active: Boolean(doc.active), order: doc.order ?? 0, image_id: doc.image?.site_image_id || null, updated_at: doc.updated_at || null };
}

/** Pure: next catalog key for a name that does not collide with `taken`. */
export function uniqueKey(name, taken) {
  const base = heroKey(name) || 'hero';
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
  return key;
}

/**
 * @param {{ getColl: () => Promise<object>, now?: () => Date, ttlMs?: number, clock?: () => number,
 *           savedCount?: (name: string) => Promise<number> }} deps
 *   savedCount(name) = how many stored form rows list that hero name (used to block renames/deletes).
 */
export function createHeroCatalog({ getColl, now = () => new Date(), ttlMs = CATALOG_TTL_MS, clock = () => Date.now(), savedCount = async () => 0 }) {
  let cache = null; // { at, docs }

  async function readAll() {
    const coll = await getColl();
    let docs = await coll.find({}).toArray();
    if (!docs.length) {
      try { await coll.insertMany(defaultCatalogDocs(now()), { ordered: false }); } catch { /* concurrent seed: unique key wins */ }
      docs = await coll.find({}).toArray();
    }
    return docs.map(({ _id, ...rest }) => rest).sort(byOrder);
  }

  /** All heroes (active or not), cached. Falls back to the last good read, then the code defaults. */
  async function list() {
    if (cache && clock() - cache.at < ttlMs) return cache.docs;
    try {
      const docs = await readAll();
      cache = { at: clock(), docs };
      return docs;
    } catch {
      if (cache) return cache.docs;
      return defaultCatalogDocs(now());
    }
  }

  const invalidate = () => { cache = null; };

  async function fresh() { // admin reads: no cache, errors surface
    try { return await readAll(); } catch (error) {
      if (error instanceof HeroCatalogError) throw error;
      throw new HeroCatalogError('The hero list is unavailable right now. Try again in a minute.', 503);
    }
  }

  async function create({ name, image = null, active = true, by = 'admin' }) {
    const clean = cleanHeroName(name);
    const docs = await fresh();
    if (docs.some((d) => d.name.toLowerCase() === clean.toLowerCase())) throw new HeroCatalogError(`There is already a hero called ${clean}.`, 409);
    const doc = {
      key: uniqueKey(clean, new Set(docs.map((d) => d.key))), name: clean,
      image: image ? { site_image_id: image } : null, active: Boolean(active),
      order: docs.reduce((max, d) => Math.max(max, d.order ?? 0), -1) + 1,
      created_at: now(), updated_at: now(), updated_by: by,
    };
    await (await getColl()).insertOne({ ...doc });
    invalidate();
    return doc;
  }

  async function update(key, patch, { by = 'admin' } = {}) {
    const docs = await fresh();
    const doc = docs.find((d) => d.key === key);
    if (!doc) throw new HeroCatalogError('That hero no longer exists. Reload the page.', 404);
    const $set = { updated_at: now(), updated_by: by };
    let oldImage = null;
    if (patch.name !== undefined) {
      const clean = cleanHeroName(patch.name);
      if (clean !== doc.name) {
        if (docs.some((d) => d.key !== key && d.name.toLowerCase() === clean.toLowerCase())) throw new HeroCatalogError(`There is already a hero called ${clean}.`, 409);
        const saved = await savedCount(doc.name);
        if (saved > 0) throw new HeroCatalogError(`${doc.name} is saved on ${saved} member form${saved === 1 ? '' : 's'}, and forms remember the name. To keep those forms correct, add ${clean} as a new hero and switch ${doc.name} off instead.`, 409, { code: 'rename_blocked', saved });
        $set.name = clean;
      }
    }
    if (patch.active !== undefined) $set.active = Boolean(patch.active);
    if (patch.image !== undefined) {
      const next = patch.image ? { site_image_id: String(patch.image) } : null;
      if ((next?.site_image_id || null) !== (doc.image?.site_image_id || null)) oldImage = doc.image?.site_image_id || null;
      $set.image = next;
    }
    await (await getColl()).updateOne({ key }, { $set });
    invalidate();
    return { hero: { ...doc, ...$set }, oldImage };
  }

  /** Moves heroes to the given key order (unknown keys ignored, unlisted ones keep relative order at the end). */
  async function reorder(keys, { by = 'admin' } = {}) {
    const docs = await fresh();
    const wanted = [...new Set((keys || []).map(String))].filter((k) => docs.some((d) => d.key === k));
    const rest = docs.filter((d) => !wanted.includes(d.key)).map((d) => d.key);
    const finalKeys = [...wanted, ...rest];
    for (let i = 0; i < finalKeys.length; i += 1) await (await getColl()).updateOne({ key: finalKeys[i] }, { $set: { order: i, updated_at: now(), updated_by: by } });
    invalidate();
    return finalKeys;
  }

  /** Deletes only heroes nobody saved; otherwise the caller should switch them off. */
  async function remove(key) {
    const docs = await fresh();
    const doc = docs.find((d) => d.key === key);
    if (!doc) throw new HeroCatalogError('That hero no longer exists. Reload the page.', 404);
    const saved = await savedCount(doc.name);
    if (saved > 0) throw new HeroCatalogError(`${doc.name} is saved on ${saved} member form${saved === 1 ? '' : 's'}, so it cannot be deleted. Switch it off instead; it then disappears from the forms but stays readable in the admin lists.`, 409, { code: 'in_use', saved });
    await (await getColl()).deleteOne({ key });
    invalidate();
    return { hero: doc };
  }

  return {
    list, invalidate, fresh, create, update, reorder, remove,
    activeNames: async () => activeHeroNames(await list()),
    publicList: async () => publicHeroes(await list()),
  };
}
