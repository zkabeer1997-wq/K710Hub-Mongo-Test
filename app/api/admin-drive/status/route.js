import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { getDriveStorage, isDriveOAuthConfigured } from '../../../../lib/driveStorage.server';
import { readPickerEnv } from '../../../../lib/pickerConfig.mjs';
import { WAITING_FILTER } from '../../../../lib/interestScreenshots.mjs';
import { ROOT_FOLDER_NAME } from '../../../../lib/driveFolders.mjs';

export const dynamic = 'force-dynamic';

// Small status for the "Google Drive connected" banner shown on admin pages that use images.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  try {
    const drive = await getDriveStorage();
    const status = await drive.getStatus();
    let waitingApplications = 0;
    try { waitingApplications = await (await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS)).countDocuments(WAITING_FILTER); } catch { /* optional */ }
    return NextResponse.json({
      configured: drive.fake ? true : isDriveOAuthConfigured(), connected: Boolean(status.connected), fake: Boolean(status.fake),
      email: status.email || '', rootFolder: ROOT_FOLDER_NAME, pickerConfigured: drive.fake ? true : readPickerEnv().configured, waitingApplications,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('drive status failed', error?.message);
    return NextResponse.json({ error: 'Unable to read Google Drive status.' }, { status: 500 });
  }
}
