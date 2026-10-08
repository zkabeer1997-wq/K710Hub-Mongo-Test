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
import { isAdminRequest } from '../../../../lib/adminAuth';
import { GALLERY_DRIVE_STATE_COOKIE } from '../../../../lib/galleryDriveOAuth.mjs';
import { exchangeCode } from '../../../../lib/driveClient.mjs';
import { getTokenStore } from '../../../../lib/driveStorage.server';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// JSON is valid JS, but "</script>" or U+2028 inside a string could still break out of the tag.
const safeJsonForScript = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function popupResponse({ ok, message }, init = {}) {
  const nonce = btoa(crypto.randomUUID());
  const payload = safeJsonForScript({ googleDriveAuthed: ok, error: ok ? undefined : message });
  const text = ok ? 'Signed in. You can close this window.' : (message || 'Something went wrong. Close this window and try again.');
  const html = `<!doctype html><html><body>
<script nonce="${nonce}">
  try {
    if (window.opener) window.opener.postMessage(${payload}, window.location.origin);
  } catch (e) {}
  window.close();
</script>
<p>${escapeHtml(text)}</p>
</body></html>`;
  // This route is the only /api response with an inline script, so it carries its
  // own nonce-based CSP (next.config.js excludes it from the blanket /api policy).
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' },
    ...init,
  });
}

// Gallery-storage connect flow (full-page redirect, offline access). Stores the
// refresh token encrypted server-side; the browser never sees it.
async function handleGalleryStorageCallback(request, expectedState) {
  const back = (result) => {
    const res = NextResponse.redirect(new URL(`/admin/dashboard/gallery?drive=${result}`, request.url));
    res.cookies.set(GALLERY_DRIVE_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };
  const url = new URL(request.url);
  if (url.searchParams.get('state') !== expectedState || !url.searchParams.get('code')) return back('failed');
  if (!(await isAdminRequest(request))) return back('failed');
  try {
    const tokens = await exchangeCode({
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      redirectUri: googleDriveRedirectUri(request),
      code: url.searchParams.get('code'),
    });
    const store = await getTokenStore();
    await store.save({ refreshToken: tokens.refreshToken, email: tokens.email });
    return back('connected');
  } catch (error) {
    console.error('gallery drive connect failed', error?.message);
    return back('failed');
  }
}

export async function GET(request) {
  const galleryState = (await cookies()).get(GALLERY_DRIVE_STATE_COOKIE)?.value;
  if (galleryState && isGoogleDriveConfigured()) return handleGalleryStorageCallback(request, galleryState);
  if (!isGoogleDriveConfigured()) {
    return popupResponse({ ok: false, message: 'Google Drive export is not configured on this deployment.' });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_DRIVE_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return popupResponse({ ok: false, message: 'Sign-in could not be verified. Please try again.' });
  }

  try {
    const client = googleDriveOAuthClient(googleDriveRedirectUri(request));
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) throw new Error('No access token returned.');

    const response = popupResponse({ ok: true });
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
    return popupResponse({ ok: false, message: 'Could not complete Google sign-in. Please try again.' });
  }
}
