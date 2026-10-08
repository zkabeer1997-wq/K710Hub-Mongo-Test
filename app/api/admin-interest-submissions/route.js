import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { screenshotProxyUrl } from '../../../lib/interestScreenshots.mjs';

const SCREENSHOT_LIMIT = 20;

// New screenshots live in Google Drive (metadata only in `screenshot_files`, ids
// never leave the server). Rows that still hold base64 data URLs (fallback or legacy): The list
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
            screenshots_in_db: {
              $size: { $filter: { input: { $ifNull: ['$screenshot_urls', []] }, as: 'u', cond: { $eq: [{ $substrCP: ['$$u', 0, 5] }, 'data:'] } } },
            },
          },
        },
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
      // Applications whose screenshots wait in MongoDB (Drive was unavailable, or
      // legacy rows): drives the "Move to Drive" warning in the Inbox.
      waitingForDrive: (data || []).filter((r) => r.screenshots_in_db > 0).length,
      rows: (data || []).map(({ _id, screenshot_files: driveFiles = [], drive_folder_id: _folder, ...r }) => {
        const id = r.id || String(_id);
        // Slot order matches lib/interestScreenshots.mjs screenshotSlots(): Drive files, then stored URLs.
        const files = [...driveFiles].sort((a, b) => a.idx - b.idx);
        const screenshots = [
          ...files.map((_, index) => screenshotProxyUrl(id, index)),
          ...(r.screenshot_urls || []).map((url, index) => url || screenshotProxyUrl(id, files.length + index)),
        ];
        return { ...r, id, screenshot_urls: screenshots, screenshot_names: files.map((f) => f.name) };
      }),
    });
  } catch (error) {
    // Collection may not exist in the one-time export
    console.error('admin-interest-submissions GET failed', error);
    return NextResponse.json({ rows: [] });
  }
}
