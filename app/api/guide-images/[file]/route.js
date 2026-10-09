import { getCollection } from '../../../../lib/mongo';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { streamDriveImage } from '../../../../lib/siteImages.mjs';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { readMemberSession } from '../../../../lib/memberAuth';
import { guidesTable } from '../../../../lib/guideAccess.mjs';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { GUIDE_BODY_PRIVATE_CACHE, GUIDE_BODY_PROJECTION, GUIDE_BODY_PUBLIC_CACHE, createGuideRowsCache, guideBodyImageAccess } from '../../../../lib/guideBodyImages.mjs';
import { GUIDE_FILE_RE } from '../../../../lib/guideImageStore.mjs';

export const dynamic = 'force-dynamic';

const loadGuides = createGuideRowsCache(async () => {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  const coll = await getCollection(table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES);
  return coll.find({}).project(GUIDE_BODY_PROJECTION).toArray();
}, { ttl: Number(process.env.GUIDE_IMAGE_ACCESS_TTL_MS ?? 10000) });

// Access follows the guides that use the image (lib/guideBodyImages.mjs): members-only guides' images need a
// member or admin session and are never publicly cacheable; unreferenced files are admin-only (the builder's
// not-yet-saved previews); everything else keeps public caching, revalidated hourly.
// Serves images uploaded through the guide page builder. File names are random
// UUIDs, so guides can embed them on public pages without a session. New
// images stream from Google Drive (ids stay server-side, long immutable cache);
// legacy rows still carry a base64 data_url until migrated.
export async function GET(request, { params }) {
  const { file } = await params;
  if (!GUIDE_FILE_RE.test(file || '')) return new Response('Not found', { status: 404 });
  try {
    const coll = await getCollection('guide_attachments');
    const row = await coll.findOne({ path: file }, { projection: { data_url: 1, content_type: 1, drive_file_id: 1, drive_md5: 1, size: 1, _id: 0 } });
    if (!row) return new Response('Not found', { status: 404 });
    const level = guideBodyImageAccess(await loadGuides(), file);
    if (level !== 'public') {
      const allowed = (await isAdminRequest(request)) || (level === 'members' && Boolean(await readMemberSession(request)));
      if (!allowed) return new Response('Not found', { status: 404, headers: { 'Cache-Control': GUIDE_BODY_PRIVATE_CACHE } });
    }
    const cacheControl = level === 'public' ? GUIDE_BODY_PUBLIC_CACHE : GUIDE_BODY_PRIVATE_CACHE;
    if (row.drive_file_id) {
      return streamDriveImage({
        fileId: row.drive_file_id, mime: row.content_type, md5: row.drive_md5, size: row.size ?? null,
        cacheControl, ifNoneMatch: request.headers?.get?.('if-none-match') ?? null, getDrive: getDriveStorage,
      });
    }
    const comma = row.data_url?.indexOf(',') ?? -1;
    if (comma < 0) return new Response('Not found', { status: 404 });
    const bytes = Buffer.from(row.data_url.slice(comma + 1), 'base64');
    return new Response(bytes, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error('guide image read failed', error);
    return new Response('Unable to load image', { status: 500 });
  }
}
