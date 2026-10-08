import { getCollection } from '../../../../lib/mongo';

export const dynamic = 'force-dynamic';

const FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

// Serves images uploaded through the guide page builder. File names are random
// UUIDs, so guides can embed them on public pages without a session.
export async function GET(request, { params }) {
  const { file } = await params;
  if (!FILE_RE.test(file || '')) return new Response('Not found', { status: 404 });
  try {
    const coll = await getCollection('guide_attachments');
    const row = await coll.findOne({ path: file }, { projection: { data_url: 1, content_type: 1, _id: 0 } });
    const comma = row?.data_url?.indexOf(',') ?? -1;
    if (!row || comma < 0) return new Response('Not found', { status: 404 });
    const bytes = Buffer.from(row.data_url.slice(comma + 1), 'base64');
    return new Response(bytes, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error('guide image read failed', error);
    return new Response('Unable to load image', { status: 500 });
  }
}
