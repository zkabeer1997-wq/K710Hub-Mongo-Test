import { google } from 'googleapis';

// Drive-only OAuth, entirely separate from Supabase/Kingshot admin auth.
// Scopes are intentionally narrow: drive.file only sees files this app
// creates, spreadsheets lets it write to the sheet it just created.
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

export const GOOGLE_DRIVE_TOKEN_COOKIE = 'google_drive_token';
export const GOOGLE_DRIVE_STATE_COOKIE = 'google_drive_oauth_state';

// Matches the token's own ~1hr lifetime, per the plan's design — the
// popup flow re-triggers automatically once this (and the token) expire.
export const GOOGLE_DRIVE_TOKEN_MAX_AGE_SECONDS = 3500;

export function isGoogleDriveConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET);
}

export function googleDriveOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    redirectUri
  );
}

// The redirect URI is derived from the live request origin rather than a
// fixed env var, since this app runs on several Vercel domains
// (production, testing, preview branch aliases, localhost). Each origin
// that will actually be used for this flow needs to be registered as an
// authorized redirect URI in the Google Cloud OAuth client — see the
// setup notes in the Phase 7 PR/commit description.
export function googleDriveRedirectUri(request) {
  return `${new URL(request.url).origin}/api/google-drive/callback`;
}
