import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getDriveStorage } from '../../../../lib/driveStorage.server';
import { buildPickerConfig } from '../../../../lib/pickerConfig.mjs';

export const dynamic = 'force-dynamic';

// Admin only. Returns a short-lived access token (drive.file) for the Google
// Picker. The refresh token never leaves the server.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  try {
    const result = await buildPickerConfig({ drive: await getDriveStorage() });
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('picker config failed', error?.code || error?.message);
    if (error?.code === 'reauth' || error?.code === 'not_connected') return NextResponse.json({ error: 'Google Drive needs to be reconnected.', needsConnect: true }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ error: 'Google Drive is unavailable right now.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
