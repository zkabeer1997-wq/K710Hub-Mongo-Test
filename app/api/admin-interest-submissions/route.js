import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

const SCREENSHOT_LIMIT = 20;

// Screenshots are stored as base64 data URLs inside each submission. The list
// must not ship them: the aggregation replaces every data: URL with null
// server-side, and the handler turns those slots into links to the on-demand
// screenshot endpoint. Legacy https URLs pass through untouched.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    const data = await coll
      .aggregate([
        { $sort: { created_at: -1 } },
        {
          $addFields: {
            screenshot_urls: {
              $map: {
                input: { $slice: [{ $ifNull: ['$screenshot_urls', []] }, SCREENSHOT_LIMIT] },
                as: 'u',
                in: { $cond: [{ $eq: [{ $substrCP: ['$$u', 0, 5] }, 'data:'] }, null, '$$u'] },
              },
            },
          },
        },
      ])
      .toArray();
    return NextResponse.json({
      rows: (data || []).map(({ _id, ...r }) => {
        const id = r.id || String(_id);
        const screenshots = (r.screenshot_urls || []).map((url, index) =>
          url || `/api/admin-interest-submissions/${encodeURIComponent(id)}/screenshot/${index}`
        );
        return { ...r, id, screenshot_urls: screenshots };
      }),
    });
  } catch (error) {
    // Collection may not exist in the one-time export
    console.error('admin-interest-submissions GET failed', error);
    return NextResponse.json({ rows: [] });
  }
}
