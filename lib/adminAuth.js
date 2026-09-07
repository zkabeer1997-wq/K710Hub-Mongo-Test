const ADMIN_COOKIE_NAME = 'tff_admin_session';

// 8 hours, matching the cookie's own maxAge in admin-login/route.js - the
// expiry lives inside the signed token itself now, not just the cookie
// jar, so a copied cookie value can't be replayed past its window even if
// it's presented directly to an API route instead of through the browser.
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Length-independent equality. node:crypto's timingSafeEqual is unavailable on
// the edge runtime, where middleware.js calls into this module, so compare by
// XOR-accumulating char codes instead of short-circuiting on first mismatch.
function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function toBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function signPayload(payload) {
  const secret = process.env.ADMIN_PASSWORD || '';
  return sha256Hex(`tff-admin-session-v2:${payload}:${secret}`);
}

// Mints a fresh, single-use-window token at login time: a random nonce (so
// two logins never produce the same value, unlike the old
// sha256(password)-only scheme) plus an expiry baked into the signed
// payload itself.
export async function mintAdminToken() {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) return null;
  const nonce = crypto.randomUUID();
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = toBase64Url(JSON.stringify({ nonce, exp }));
  const signature = await signPayload(payload);
  return `${payload}.${signature}`;
}

export async function isValidAdminToken(token) {
  if (!process.env.ADMIN_PASSWORD) return false;
  if (!token) return false;

  const [payload, signature] = String(token).split('.');
  if (!payload || !signature) return false;

  const expected = await signPayload(payload);
  if (!safeEqual(signature, expected)) return false;

  try {
    const { exp } = JSON.parse(fromBase64Url(payload));
    return Number.isFinite(exp) && exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAdminRequest(request) {
  const cookie = request.cookies.get(ADMIN_COOKIE_NAME);
  return isValidAdminToken(cookie && cookie.value);
}

export { ADMIN_COOKIE_NAME, TOKEN_TTL_MS };
