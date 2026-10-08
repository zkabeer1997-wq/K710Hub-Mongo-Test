import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { countLegacyImages, migrateBatch } from '../../../../lib/galleryMigration.mjs';
import { CONNECT_DRIVE_MESSAGE } from '../../../../lib/galleryUpload.mjs';

export const dynamic = 'force-dynamic';

// POST { dryRun: true } -> { legacyCount }. POST { skipIds? } -> migrates one
// small batch and returns { migrated, failed, remaining }; the UI loops.
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  try {
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    if (body.dryRun) return NextResponse.json({ dryRun: true, legacyCount: await countLegacyImages(coll) });
    const drive = await getDriveStorage();
    if (!(await drive.getStatus()).connected) return NextResponse.json({ error: CONNECT_DRIVE_MESSAGE, needsConnect: true }, { status: 409 });
    const skipIds = Array.isArray(body.skipIds) ? body.skipIds.filter((s) => typeof s === 'string').slice(0, 500) : [];
    const result = await migrateBatch({ coll, drive, skipIds });
    if (result.migrated.length) { revalidatePath('/'); revalidatePath('/gallery'); }
    return NextResponse.json(result);
  } catch (error) {
    console.error('gallery migration failed', error);
    return NextResponse.json({ error: 'Migration failed. Nothing was lost; try again.' }, { status: 500 });
  }
}
