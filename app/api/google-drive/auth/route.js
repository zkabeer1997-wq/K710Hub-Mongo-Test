import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAdminRequest } from '../../../../lib/adminAuth';
import {
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_DRIVE_STATE_COOKIE,
  googleDriveOAuthClient,
  googleDriveRedirectUri,
  isGoogleDriveConfigured,
} from '../../../../lib/googleDrive.server';

// Opened in a popup by ExportToGoogleDrive. Redirects to Google's consent
// screen; the CSRF state is round-tripped via an httpOnly cookie, not a
// query param the popup could be tricked into carrying.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive export is not configured on this deployment.' },
      { status: 501 }
    );
  }

  const state = randomUUID();
  const client = googleDriveOAuthClient(googleDriveRedirectUri(request));
  const authUrl = client.generateAuthUrl({
    access_type: 'online',
    scope: GOOGLE_DRIVE_SCOPES,
    state,
    prompt: 'consent',
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GOOGLE_DRIVE_STATE_COOKIE, state, {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return response;
}
