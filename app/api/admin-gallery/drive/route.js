import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { clearDriveAccessCache, getDriveStorage, getTokenStore, isDriveOAuthConfigured } from '../../../../lib/driveStorage.server';
import { revokeToken } from '../../../../lib/driveClient.mjs';
import { countLegacyImages } from '../../../../lib/galleryMigration.mjs';
import { guideLegacyFilter } from '../../../../lib/guideImageStore.mjs';
import { WAITING_FILTER } from '../../../../lib/interestScreenshots.mjs';

export const dynamic = 'force-dynamic';

async function guard(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  return null;
}

export async function GET(request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const drive = await getDriveStorage();
    const status = await drive.getStatus();
    const coll = await getCollection(COLLECTIONS.GALLERY_IMAGES);
    const legacyCount = await countLegacyImages(coll);
    let legacyGuideImages = 0; let waitingApplications = 0;
    try { legacyGuideImages = await (await getCollection('guide_attachments')).countDocuments(guideLegacyFilter()); } catch { /* optional */ }
    try { waitingApplications = await (await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS)).countDocuments(WAITING_FILTER); } catch { /* optional */ }
    return NextResponse.json(
      { configured: drive.fake ? true : isDriveOAuthConfigured(), connected: Boolean(status.connected), fake: Boolean(status.fake), email: status.email || '', folderName: status.folderName || '', legacyCount, legacyGuideImages, waitingApplications },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('gallery drive status failed', error);
    return NextResponse.json({ error: 'Unable to read Google Drive status.' }, { status: 500 });
  }
}

// Disconnect: forgets (and best-effort revokes) the stored refresh token.
// Existing files stay in Drive but images stop loading until reconnected.
export async function POST(request) {
  const denied = await guard(request);
  if (denied) return denied;
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (body.action !== 'disconnect') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  try {
    const store = await getTokenStore();
    const creds = await store.load();
    await store.clear();
    clearDriveAccessCache();
    if (creds?.refreshToken) await revokeToken(creds.refreshToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('gallery drive disconnect failed', error);
    return NextResponse.json({ error: 'Unable to disconnect Google Drive.' }, { status: 500 });
  }
}
