import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { buildAuthUrl } from '../../../../lib/driveClient.mjs';
import { googleDriveRedirectUri, isGoogleDriveConfigured } from '../../../../lib/googleDrive.server';
import { GALLERY_DRIVE_STATE_COOKIE } from '../../../../lib/galleryDriveOAuth.mjs';

// One-time "Connect Google Drive" for gallery storage: full-page redirect
// (not a popup), offline access so a refresh token is issued. The shared
// callback (/api/google-drive/callback) recognises this flow by its cookie,
// so no extra redirect URI needs registering in Google Cloud.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  if (!isGoogleDriveConfigured()) {
    return NextResponse.redirect(new URL('/admin/dashboard/gallery?drive=not-configured', request.url));
  }
  const state = randomUUID();
  const response = NextResponse.redirect(buildAuthUrl({
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    redirectUri: googleDriveRedirectUri(request),
    state,
  }));
  response.cookies.set(GALLERY_DRIVE_STATE_COOKIE, state, {
    path: '/', maxAge: 600, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
  });
  return response;
}
