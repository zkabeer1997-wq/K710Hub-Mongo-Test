import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  GOOGLE_DRIVE_STATE_COOKIE,
  GOOGLE_DRIVE_TOKEN_COOKIE,
  GOOGLE_DRIVE_TOKEN_MAX_AGE_SECONDS,
  googleDriveOAuthClient,
  googleDriveRedirectUri,
  isGoogleDriveConfigured,
} from '../../../../lib/googleDrive.server';

function popupResponseHtml({ ok, message }) {
  const payload = JSON.stringify({ googleDriveAuthed: ok, error: ok ? undefined : message });
  return `<!doctype html><html><body>
<script>
  try {
    if (window.opener) window.opener.postMessage(${payload}, window.location.origin);
  } catch (e) {}
  window.close();
</script>
<p>${ok ? 'Signed in. You can close this window.' : (message || 'Something went wrong. Close this window and try again.')}</p>
</body></html>`;
}

export async function GET(request) {
  if (!isGoogleDriveConfigured()) {
    return new NextResponse(popupResponseHtml({ ok: false, message: 'Google Drive export is not configured on this deployment.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_DRIVE_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return new NextResponse(popupResponseHtml({ ok: false, message: 'Sign-in could not be verified. Please try again.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const client = googleDriveOAuthClient(googleDriveRedirectUri(request));
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) throw new Error('No access token returned.');

    const response = new NextResponse(popupResponseHtml({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    response.cookies.set(GOOGLE_DRIVE_TOKEN_COOKIE, tokens.access_token, {
      path: '/',
      maxAge: GOOGLE_DRIVE_TOKEN_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    response.cookies.set(GOOGLE_DRIVE_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    console.error('google-drive callback failed', error);
    return new NextResponse(popupResponseHtml({ ok: false, message: 'Could not complete Google sign-in. Please try again.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
