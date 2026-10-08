import { getCollection } from '../../../../lib/mongo';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { IMMUTABLE_IMAGE_CACHE, streamDriveImage } from '../../../../lib/siteImages.mjs';
import { GUIDE_FILE_RE } from '../../../../lib/guideImageStore.mjs';

export const dynamic = 'force-dynamic';

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
    if (row.drive_file_id) {
      return streamDriveImage({
        fileId: row.drive_file_id, mime: row.content_type, md5: row.drive_md5, size: row.size ?? null,
        cacheControl: IMMUTABLE_IMAGE_CACHE, ifNoneMatch: request.headers?.get?.('if-none-match') ?? null, getDrive: getDriveStorage,
      });
    }
    const comma = row.data_url?.indexOf(',') ?? -1;
    if (comma < 0) return new Response('Not found', { status: 404 });
    const bytes = Buffer.from(row.data_url.slice(comma + 1), 'base64');
    return new Response(bytes, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        'Cache-Control': IMMUTABLE_IMAGE_CACHE,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error('guide image read failed', error);
    return new Response('Unable to load image', { status: 500 });
  }
}
