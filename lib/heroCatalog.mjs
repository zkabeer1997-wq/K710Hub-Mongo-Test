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

/** Case/accent/space/punctuation-insensitive identity of a hero ("Long Fei", "LONG-FEI", "Longfei" -> "longfei"). */
export function heroNameNorm(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const time = (v) => { const t = v instanceof Date ? v.getTime() : new Date(v || 0).getTime(); return Number.isFinite(t) && t > 0 ? t : Infinity; };
const imageIdOf = (d) => d?.image?.site_image_id || null;

/** Deterministic "best row" order: has an image, then active, then oldest, then lowest order, then _id/key. */
function betterFirst(a, b) {
  return (Number(Boolean(imageIdOf(b))) - Number(Boolean(imageIdOf(a))))
    || (Number(Boolean(b.active)) - Number(Boolean(a.active)))
    || (time(a.created_at) - time(b.created_at) || 0)
    || ((a.order ?? 0) - (b.order ?? 0))
    || String(a._id ?? a.key).localeCompare(String(b._id ?? b.key));
}

/**
 * Pure. Groups catalog rows by normalised name and keeps one best row per group.
 * Returns { kept, drop (rows to delete), patches ({ doc, set } to write on kept rows: merged image, name_norm), groups }.
 */
export function planHeroDedupe(docs) {
  const groups = new Map();
  for (const doc of docs || []) {
    const norm = heroNameNorm(doc?.name) || `key:${doc?.key}`;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(doc);
  }
  const kept = []; const drop = []; const patches = []; let dupGroups = 0;
  for (const [norm, rows] of groups) {
    const sorted = [...rows].sort(betterFirst);
    const best = sorted[0];
    const set = {};
    if (rows.length > 1) {
      dupGroups += 1;
      drop.push(...sorted.slice(1));
      if (!imageIdOf(best)) { const donor = sorted.find((r) => imageIdOf(r)); if (donor) set.image = donor.image; }
    }
    if (best.name_norm !== norm && !norm.startsWith('key:')) set.name_norm = norm;
    const merged = { ...best, ...set };
    kept.push(merged);
    if (Object.keys(set).length) patches.push({ doc: best, set });
  }
  return { kept, drop, patches, groups: dupGroups };
}

/** In-memory read-time dedupe (keeps the best row of each normalised name). */
export const dedupeHeroDocs = (docs) => planHeroDedupe(docs).kept;

/**
 * Applies (or, with apply=false, only reports) the cleanup on a hero_catalog collection:
 * deletes duplicate rows, merges the image onto the kept row, backfills name_norm. Never touches member answers.
 */
export async function dedupeHeroCollection(coll, { apply = false } = {}) {
  const docs = await coll.find({}).toArray();
  const plan = planHeroDedupe(docs);
  const summary = { total: docs.length, kept: plan.kept.length, duplicateGroups: plan.groups, removed: plan.drop.map((d) => d.name), backfilled: plan.patches.filter((p) => p.set.name_norm).length, applied: false };
  if (apply) {
    for (const { doc, set } of plan.patches) await coll.updateOne({ _id: doc._id }, { $set: set });
    if (plan.drop.length) await coll.deleteMany({ _id: { $in: plan.drop.map((d) => d._id) } });
    summary.applied = true;
  }
  return summary;
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
    key: heroKey(row.name), name: row.name, name_norm: heroNameNorm(row.name), image: null, active: row.active, order,
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
export const publicHeroes = (docs) => dedupeHeroDocs(docs).filter((d) => d.active).sort(byOrder).map(publicHero);
export const activeHeroNames = (docs) => dedupeHeroDocs(docs).filter((d) => d.active).sort(byOrder).map((d) => d.name);

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

const isDuplicateKey = (error) => error?.code === 11000;

/**
 * @param {{ getColl: () => Promise<object>, getRemovedColl?: () => Promise<object>, now?: () => Date, ttlMs?: number, clock?: () => number,
 *           savedCount?: (name: string) => Promise<number> }} deps
 *   savedCount(name) = how many stored form rows list that hero name (used to block renames and to show "saved by N").
 *   getRemovedColl = tombstones { _id: name_norm, key, name, removed_at, removed_by } so lazy seeding never re-adds a removed hero.
 */
export function createHeroCatalog({ getColl, getRemovedColl = null, now = () => new Date(), ttlMs = CATALOG_TTL_MS, clock = () => Date.now(), savedCount = async () => 0 }) {
  let cache = null; // { at, docs }

  const tombstones = async () => (getRemovedColl ? (await (await getRemovedColl()).find({}).toArray()) : []);
  const clearTombstone = async (norm) => { if (getRemovedColl) await (await getRemovedColl()).deleteOne({ _id: norm }); };

  /** Idempotent seed: one upsert per default, keyed by normalised name, skipping removed (tombstoned) names. Safe to run from many instances at once. */
  async function seed(coll, removedNorms) {
    for (const doc of defaultCatalogDocs(now())) {
      if (removedNorms.has(doc.name_norm)) continue;
      const { name_norm, ...rest } = doc;
      try { await coll.updateOne({ name_norm }, { $setOnInsert: rest }, { upsert: true }); } catch (error) { if (!isDuplicateKey(error)) throw error; /* another instance won */ }
    }
  }

  async function readAll() {
    const coll = await getColl();
    const removedNorms = new Set((await tombstones()).map((t) => String(t._id)));
    let docs = await coll.find({}).toArray();
    if (!docs.length) { await seed(coll, removedNorms); docs = await coll.find({}).toArray(); }
    return dedupeHeroDocs(docs).filter((d) => !removedNorms.has(heroNameNorm(d.name))).map(({ _id, ...rest }) => rest).sort(byOrder);
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
    const norm = heroNameNorm(clean);
    const docs = await fresh();
    if (docs.some((d) => heroNameNorm(d.name) === norm)) throw new HeroCatalogError(`There is already a hero called ${clean}.`, 409);
    const doc = {
      key: uniqueKey(clean, new Set(docs.map((d) => d.key))), name: clean, name_norm: norm,
      image: image ? { site_image_id: image } : null, active: Boolean(active),
      order: docs.reduce((max, d) => Math.max(max, d.order ?? 0), -1) + 1,
      created_at: now(), updated_at: now(), updated_by: by,
    };
    await clearTombstone(norm); // adding a removed hero's name again brings it back for good
    try { await (await getColl()).insertOne({ ...doc }); } catch (error) {
      if (isDuplicateKey(error)) throw new HeroCatalogError(`There is already a hero called ${clean}.`, 409);
      throw error;
    }
    invalidate();
    return doc;
  }

  async function update(key, patch, { by = 'admin' } = {}) {
    const docs = await fresh();
    const doc = docs.find((d) => d.key === key);
    if (!doc) throw new HeroCatalogError('That hero no longer exists. Reload the page.', 404);
    const $set = { updated_at: now(), updated_by: by };
    let oldImage = null;
    let renamedTo = null;
    if (patch.name !== undefined) {
      const clean = cleanHeroName(patch.name);
      if (clean !== doc.name) {
        const norm = heroNameNorm(clean);
        if (docs.some((d) => d.key !== key && heroNameNorm(d.name) === norm)) throw new HeroCatalogError(`There is already a hero called ${clean}.`, 409);
        const saved = await savedCount(doc.name);
        if (saved > 0) throw new HeroCatalogError(`${doc.name} is saved on ${saved} member form${saved === 1 ? '' : 's'}, and forms remember the name. To keep those forms correct, add ${clean} as a new hero and switch ${doc.name} off instead.`, 409, { code: 'rename_blocked', saved });
        $set.name = clean; $set.name_norm = norm; renamedTo = norm;
      }
    }
    if (patch.active !== undefined) $set.active = Boolean(patch.active);
    if (patch.image !== undefined) {
      const next = patch.image ? { site_image_id: String(patch.image) } : null;
      if ((next?.site_image_id || null) !== (doc.image?.site_image_id || null)) oldImage = doc.image?.site_image_id || null;
      $set.image = next;
    }
    if (renamedTo) await clearTombstone(renamedTo);
    const coll = await getColl();
    try { await coll.updateMany({ key }, { $set }); } catch (error) {
      if (isDuplicateKey(error)) throw new HeroCatalogError('There is already a hero with that name.', 409);
      throw error;
    }
    invalidate();
    return { hero: { ...doc, ...$set }, oldImage };
  }

  /** Moves heroes to the given key order (unknown keys ignored, unlisted ones keep relative order at the end). */
  async function reorder(keys, { by = 'admin' } = {}) {
    const docs = await fresh();
    const wanted = [...new Set((keys || []).map(String))].filter((k) => docs.some((d) => d.key === k));
    const rest = docs.filter((d) => !wanted.includes(d.key)).map((d) => d.key);
    const finalKeys = [...wanted, ...rest];
    for (let i = 0; i < finalKeys.length; i += 1) await (await getColl()).updateMany({ key: finalKeys[i] }, { $set: { order: i, updated_at: now(), updated_by: by } });
    invalidate();
    return finalKeys;
  }

  /**
   * Always allowed (members' saved names are never touched). Writes the tombstone FIRST so a concurrent lazy seed cannot
   * re-add the hero, then deletes every row with that normalised name. Returns the Drive image ids that were attached.
   */
  async function remove(key, { by = 'admin' } = {}) {
    const docs = await fresh();
    const doc = docs.find((d) => d.key === key);
    if (!doc) throw new HeroCatalogError('That hero no longer exists. Reload the page.', 404);
    const norm = heroNameNorm(doc.name);
    if (getRemovedColl) await (await getRemovedColl()).updateOne({ _id: norm }, { $set: { key: doc.key, name: doc.name, removed_at: now(), removed_by: by } }, { upsert: true });
    const coll = await getColl();
    const raw = (await coll.find({}).toArray()).filter((d) => heroNameNorm(d.name) === norm);
    if (raw.length) await coll.deleteMany({ _id: { $in: raw.map((d) => d._id) } });
    invalidate();
    return { hero: doc, imageIds: [...new Set(raw.map(imageIdOf).filter(Boolean))] };
  }

  /** Removed heroes (for the Restore list). */
  async function removed() {
    const rows = await tombstones();
    return rows.map((t) => ({ key: t.key || heroKey(t.name), name: t.name, default_url: staticImageUrl(t.key || heroKey(t.name)), removed_at: t.removed_at || null }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /** Brings a removed hero back (shown, last in order, built-in portrait); the admin can re-add a picture. */
  async function restore(key, { by = 'admin' } = {}) {
    const row = (await tombstones()).find((t) => (t.key || heroKey(t.name)) === key);
    if (!row) throw new HeroCatalogError('That hero is not in the removed list. Reload the page.', 404);
    const docs = await fresh();
    const norm = heroNameNorm(row.name);
    await clearTombstone(norm);
    if (!docs.some((d) => heroNameNorm(d.name) === norm)) {
      const doc = {
        key: uniqueKey(row.name, new Set(docs.map((d) => d.key))), name: row.name, name_norm: norm, image: null, active: true,
        order: docs.reduce((max, d) => Math.max(max, d.order ?? 0), -1) + 1, created_at: now(), updated_at: now(), updated_by: by,
      };
      try { await (await getColl()).insertOne({ ...doc }); } catch (error) { if (!isDuplicateKey(error)) throw error; }
    }
    invalidate();
    return { name: row.name };
  }

  /** How many duplicate rows sit in the collection right now (the admin "Remove duplicates" prompt). */
  async function duplicateReport() {
    const docs = await (await getColl()).find({}).toArray();
    const plan = planHeroDedupe(docs);
    return { groups: plan.groups, extra_rows: plan.drop.length };
  }

  /** Admin "Remove duplicates": deletes the extra rows, keeping the best one (image, active, oldest). */
  async function dedupe() {
    const summary = await dedupeHeroCollection(await getColl(), { apply: true });
    invalidate();
    return summary;
  }

  return {
    list, invalidate, fresh, create, update, reorder, remove, removed, restore, duplicateReport, dedupe,
    activeNames: async () => activeHeroNames(await list()),
    publicList: async () => publicHeroes(await list()),
  };
}
