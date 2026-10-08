import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { getHeroCatalog, adminHero, savedHeroCounts, HeroCatalogError } from '../../../lib/heroCatalog.server.js';
import { getSiteImages, publicSiteImage } from '../../../lib/siteImages.server';

export const dynamic = 'force-dynamic';

// Admin-only hero catalog (heroes offered on the KvK Availability + Flamedragon forms).
// CSRF (Origin check) is enforced centrally in proxy.js.
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const denied = () => json({ error: 'Admin login required.' }, 401);

function fail(error) {
  if (error instanceof HeroCatalogError) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
  console.error('admin-heroes failed', error);
  return json({ error: 'The hero list could not be saved. Please try again.' }, 500);
}

async function readBody(request) {
  try { const body = await request.json(); return body && typeof body === 'object' ? body : {}; } catch { return null; }
}

/** An image id must be a hero-folder site image (uploaded through /api/admin-drive/images). */
async function checkImage(id) {
  if (id === null || id === '') return null;
  const coll = await getCollection(COLLECTIONS.SITE_IMAGES);
  const doc = await coll.findOne({ _id: String(id), folder: 'hero' });
  if (!doc) throw new HeroCatalogError('That image is not in the hero images folder. Upload it again.', 400);
  return String(id);
}

async function payload() {
  const catalog = getHeroCatalog();
  const [docs, counts] = await Promise.all([catalog.fresh(), savedHeroCounts().catch(() => new Map())]);
  const ids = [...new Set(docs.map((d) => d.image?.site_image_id).filter(Boolean))];
  const metaColl = ids.length ? await getCollection(COLLECTIONS.SITE_IMAGES).catch(() => null) : null;
  const metas = metaColl ? await metaColl.find({ _id: { $in: ids } }).toArray().catch(() => []) : [];
  const metaById = new Map(metas.map((m) => [String(m._id), publicSiteImage(m)]));
  const [removed, dupes] = await Promise.all([catalog.removed().catch(() => []), catalog.duplicateReport().catch(() => ({ groups: 0, extra_rows: 0 }))]);
  return {
    removed, duplicates: dupes.extra_rows,
    heroes: docs.map((d) => ({ ...adminHero(d), saved_count: counts.get(d.name) || 0, image: metaById.get(d.image?.site_image_id) || null })),
  };
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) return denied();
  try { return json(await payload()); } catch (error) { return fail(error); }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) return denied();
  const body = await readBody(request);
  if (!body) return json({ error: 'Invalid request.' }, 400);
  try {
    // POST { action: 'restore', key } brings a removed hero back; { action: 'dedupe' } deletes duplicate rows.
    if (body.action === 'restore') {
      await getHeroCatalog().restore(String(body.key || ''));
      return json(await payload());
    }
    if (body.action === 'dedupe') {
      await getHeroCatalog().dedupe();
      return json(await payload());
    }
    const image = await checkImage(body.image_id ?? null);
    await getHeroCatalog().create({ name: body.name, image, active: body.active !== false });
    return json(await payload(), 201);
  } catch (error) { return fail(error); }
}

// PATCH { key, name?, active?, image_id? (id | null) }  or  { order: [key, ...] }
export async function PATCH(request) {
  if (!(await isAdminRequest(request))) return denied();
  const body = await readBody(request);
  if (!body) return json({ error: 'Invalid request.' }, 400);
  try {
    const catalog = getHeroCatalog();
    if (Array.isArray(body.order)) {
      await catalog.reorder(body.order);
      return json(await payload());
    }
    const key = String(body.key || '');
    if (!key) return json({ error: 'Choose a hero.' }, 400);
    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.active !== undefined) patch.active = Boolean(body.active);
    if (body.image_id !== undefined) patch.image = await checkImage(body.image_id);
    const { oldImage } = await catalog.update(key, patch);
    if (oldImage) await dropUnusedImage(oldImage);
    return json(await payload());
  } catch (error) { return fail(error); }
}

export async function DELETE(request) {
  if (!(await isAdminRequest(request))) return denied();
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key) return json({ error: 'Choose a hero.' }, 400);
  try {
    // Always allowed: members' saved hero names stay as they are; a tombstone stops lazy seeding from re-adding it.
    const { imageIds } = await getHeroCatalog().remove(key);
    for (const id of imageIds) await dropUnusedImage(id);
    return json(await payload());
  } catch (error) { return fail(error); }
}

/** A replaced/removed hero image goes to the Drive trash when no other hero uses it (best effort). */
async function dropUnusedImage(id) {
  try {
    const stillUsed = (await getHeroCatalog().fresh()).some((d) => d.image?.site_image_id === id);
    if (stillUsed) return;
    const images = await getSiteImages({ requireConnected: false });
    await images.remove(id, { folders: ['hero'] });
  } catch { /* the catalog change already succeeded; a leftover file in Drive is harmless */ }
}
