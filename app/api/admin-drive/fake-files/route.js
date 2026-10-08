import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getDriveStorage } from '../../../../lib/driveStorage.server';

export const dynamic = 'force-dynamic';

// LOCAL DEVELOPMENT ONLY: lists images in the fake Drive for the built-in fake
// picker. Real Drive has no equivalent here (the Google Picker does this).
export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  const drive = await getDriveStorage();
  if (!drive.fake || typeof drive.listImages !== 'function') return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  return NextResponse.json({ files: await drive.listImages() }, { headers: { 'Cache-Control': 'no-store' } });
}
