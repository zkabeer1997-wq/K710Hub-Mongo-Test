import crypto from 'node:crypto';

// AES-256-GCM envelope for the Google refresh token stored in Mongo.
// Key: GALLERY_TOKEN_KEY if set, else derived (HKDF-SHA256) from
// MEMBER_SESSION_SECRET. A fixed dev-only fallback exists outside production
// so local development survives restarts; production with neither set throws.
const SALT = Buffer.from('k710-gallery-token-v1');
const INFO = Buffer.from('integration_tokens');
const DEV_FALLBACK = 'k710-local-development-gallery-token-key';

export function deriveTokenKey(env = process.env) {
  const dedicated = String(env.GALLERY_TOKEN_KEY || '').trim();
  const member = String(env.MEMBER_SESSION_SECRET || '').trim();
  let ikm = dedicated || member;
  if (!ikm) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Set GALLERY_TOKEN_KEY (or MEMBER_SESSION_SECRET) to store Google Drive credentials.');
    }
    ikm = DEV_FALLBACK;
  }
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(ikm), SALT, INFO, 32));
}

export function encryptSecret(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(payload, key) {
  const [version, iv, tag, ct] = String(payload || '').split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised encrypted value.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
