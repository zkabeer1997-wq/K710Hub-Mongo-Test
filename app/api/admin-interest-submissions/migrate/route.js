import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { getFolderTree } from '../../../../lib/siteImages.server';
import { WAITING_FILTER, migrateInterestBatch } from '../../../../lib/interestScreenshots.mjs';
import { CONNECT_DRIVE_MESSAGE } from '../../../../lib/siteImages.mjs';

export const dynamic = 'force-dynamic';

// POST { dryRun: true } -> { waiting }. POST { skipIds? } -> moves one small
// batch of applications whose screenshots are still stored in MongoDB to
// Drive and returns { migrated, failed, remaining }; the UI loops.
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  try {
    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    if (body.dryRun) return NextResponse.json({ dryRun: true, waiting: await coll.countDocuments(WAITING_FILTER) });
    const drive = await getDriveStorage();
    if (!(await drive.getStatus()).connected) return NextResponse.json({ error: CONNECT_DRIVE_MESSAGE, needsConnect: true }, { status: 409 });
    const skipIds = Array.isArray(body.skipIds) ? body.skipIds.filter((s) => typeof s === 'string').slice(0, 500) : [];
    return NextResponse.json(await migrateInterestBatch({ coll, drive, tree: await getFolderTree(drive), skipIds }));
  } catch (error) {
    console.error('interest screenshot migration failed', error);
    return NextResponse.json({ error: 'Moving screenshots failed. Nothing was lost; try again.' }, { status: 500 });
  }
}
