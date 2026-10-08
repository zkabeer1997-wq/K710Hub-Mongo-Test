// Google Picker setup. The Picker needs a browser API key (restricted to HTTP
// referrers) and the Cloud project NUMBER as appId; the access token is the
// connected account's short-lived drive.file token (never the refresh token).
export const PICKER_NOT_SET_UP = 'Google Picker is not set up yet';
export const PICKER_SETUP_STEPS = Object.freeze([
  'In Google Cloud console, open the project that owns the Drive OAuth client and enable the "Google Picker API".',
  'Create an API key (APIs & Services > Credentials) and restrict it to HTTP referrers (your site domain) and to the Google Picker API.',
  'Copy the project number (Cloud console > Dashboard > Project info).',
  'Set GOOGLE_PICKER_API_KEY (the key) and GOOGLE_PICKER_APP_ID (the project number) in the server environment and redeploy.',
]);

export function readPickerEnv(env = process.env) {
  const developerKey = String(env.GOOGLE_PICKER_API_KEY || '').trim();
  const appId = String(env.GOOGLE_PICKER_APP_ID || '').trim();
  const missing = [];
  if (!developerKey) missing.push('GOOGLE_PICKER_API_KEY');
  if (!appId) missing.push('GOOGLE_PICKER_APP_ID');
  return { configured: !missing.length, developerKey, appId, missing };
}

/** Builds the picker-config response body. `drive` is the Drive client (real or fake). */
export async function buildPickerConfig({ drive, env = process.env }) {
  const status = await drive.getStatus();
  if (!status.connected) return { ok: false, status: 409, body: { configured: false, connected: false, error: 'Connect Google Drive first (one-time setup).', needsConnect: true } };
  if (drive.fake) return { ok: true, status: 200, body: { configured: true, fake: true, connected: true } };
  const picker = readPickerEnv(env);
  if (!picker.configured) return { ok: true, status: 200, body: { configured: false, connected: true, message: PICKER_NOT_SET_UP, missing: picker.missing, steps: PICKER_SETUP_STEPS } };
  const accessToken = await drive.getAccessToken();
  return { ok: true, status: 200, body: { configured: true, connected: true, accessToken, developerKey: picker.developerKey, appId: picker.appId } };
}
