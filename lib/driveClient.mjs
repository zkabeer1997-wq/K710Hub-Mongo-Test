// Tiny Google Drive REST client (plain fetch, no extra packages). Everything
// network-facing is injectable so tests run without Google.
export class DriveError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'DriveError';
    this.code = code; // 'reauth' | 'not_found' | 'upstream' | 'not_connected'
    this.status = status;
  }
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GALLERY_FOLDER_NAME = 'K710 Gallery';
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,modifiedTime,trashed';

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {{ load(): Promise<object|null>, patch(fields: object): Promise<void> }} deps.store
 *   load() returns { refreshToken, email, folderId, folderName } or null.
 */
export function createDriveClient({ fetch: fetchImpl = fetch, store, clientId, clientSecret, now = () => Date.now(), tokenCache = {} }) {
  // tokenCache.access = { token, expiresAt }; pass a long-lived object so
  // access tokens are shared across requests instead of refreshed each time.

  async function refresh(refreshToken) {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      if (json.error === 'invalid_grant' || res.status === 400 || res.status === 401) {
        throw new DriveError('reauth', 'Google Drive access was revoked or expired. Reconnect Google Drive.', 401);
      }
      throw new DriveError('upstream', 'Could not refresh Google Drive access.', 502);
    }
    tokenCache.access = { token: json.access_token, expiresAt: now() + Math.max(60, Number(json.expires_in) || 3600) * 1000 - 60_000 };
    return tokenCache.access.token;
  }

  async function accessToken(force = false) {
    const access = tokenCache.access;
    if (!force && access && access.expiresAt > now()) return access.token;
    const creds = await store.load();
    if (!creds?.refreshToken) throw new DriveError('not_connected', 'Google Drive is not connected.', 409);
    return refresh(creds.refreshToken);
  }

  async function call(url, init = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await accessToken(attempt > 0);
      const res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt === 0) { tokenCache.access = null; continue; }
      if (res.status === 404) throw new DriveError('not_found', 'File not found in Drive.', 404);
      if (res.status === 401 || res.status === 403) {
        throw new DriveError('reauth', 'Google Drive refused access. Reconnect Google Drive.', res.status);
      }
      if (!res.ok) throw new DriveError('upstream', `Drive request failed (${res.status}).`, 502);
      return res;
    }
    throw new DriveError('upstream', 'Drive request failed.', 502);
  }

  const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return {
    fake: false,
    async getStatus() {
      const creds = await store.load();
      if (!creds?.refreshToken) return { connected: false };
      return { connected: true, email: creds.email || '', folderName: creds.folderName || GALLERY_FOLDER_NAME };
    },
    async ensureFolder(name = GALLERY_FOLDER_NAME) {
      const creds = await store.load();
      if (creds?.folderId) {
        try {
          const info = await (await call(`${API}/files/${encodeURIComponent(creds.folderId)}?fields=id,trashed`)).json();
          if (!info.trashed) return creds.folderId;
        } catch (e) { if (e.code !== 'not_found') throw e; }
      }
      const params = new URLSearchParams({ q: `name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id,name)', spaces: 'drive' });
      const found = await (await call(`${API}/files?${params}`)).json();
      let id = found.files?.[0]?.id;
      if (!id) {
        const created = await (await call(`${API}/files?fields=id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
        })).json();
        id = created.id;
      }
      await store.patch({ folderId: id, folderName: name });
      return id;
    },
    async uploadFile({ name, mimeType, bytes, folderId }) {
      const parent = folderId || (await this.ensureFolder());
      const boundary = `k710-${now()}-${Math.random().toString(36).slice(2)}`;
      const meta = JSON.stringify({ name, parents: [parent], mimeType });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        Buffer.from(bytes),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
      return res.json();
    },
    async getInfo(fileId) {
      return (await call(`${API}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`)).json();
    },
    async downloadFile(fileId) {
      const res = await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
      return {
        body: res.body,
        mimeType: res.headers.get('content-type') || 'application/octet-stream',
        size: Number(res.headers.get('content-length')) || null,
      };
    },
    async trashFile(fileId) {
      await call(`${API}/files/${encodeURIComponent(fileId)}?fields=id`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
      });
    },
  };
}

/** One-time OAuth helpers (authorization-code exchange, plain fetch). */
export function buildAuthUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode({ fetch: fetchImpl = fetch, clientId, clientSecret, redirectUri, code }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new DriveError('upstream', 'Google did not accept the sign-in.', 502);
  if (!json.refresh_token) throw new DriveError('upstream', 'Google did not return offline access. Remove this app at myaccount.google.com/permissions and connect again.', 502);
  let email = '';
  try {
    const about = await fetchImpl(`${API}/about?fields=user(emailAddress)`, { headers: { Authorization: `Bearer ${json.access_token}` } });
    if (about.ok) email = (await about.json())?.user?.emailAddress || '';
  } catch { /* email is cosmetic */ }
  return { refreshToken: json.refresh_token, accessToken: json.access_token, email };
}

export async function revokeToken(token, fetchImpl = fetch) {
  try { await fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }); } catch { /* best effort */ }
}
