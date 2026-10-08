import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { getFolderTree } from '../../../../lib/siteImages.server';
import { guideLegacyFilter, migrateGuideBatch } from '../../../../lib/guideImageStore.mjs';
import { CONNECT_DRIVE_MESSAGE } from '../../../../lib/siteImages.mjs';

export const dynamic = 'force-dynamic';

// POST { dryRun: true } -> { legacyCount }. POST { skipPaths? } -> moves one
// small batch of legacy base64 guide images to Drive; the UI/script loops.
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  try {
    const coll = await getCollection('guide_attachments');
    if (body.dryRun) return NextResponse.json({ dryRun: true, legacyCount: await coll.countDocuments(guideLegacyFilter()) });
    const drive = await getDriveStorage();
    if (!(await drive.getStatus()).connected) return NextResponse.json({ error: CONNECT_DRIVE_MESSAGE, needsConnect: true }, { status: 409 });
    const skipPaths = Array.isArray(body.skipPaths) ? body.skipPaths.filter((s) => typeof s === 'string').slice(0, 500) : [];
    return NextResponse.json(await migrateGuideBatch({ coll, drive, tree: await getFolderTree(drive), skipPaths }));
  } catch (error) {
    console.error('guide image migration failed', error);
    return NextResponse.json({ error: 'Migration failed. Nothing was lost; try again.' }, { status: 500 });
  }
}
