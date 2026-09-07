export const MEMBER_COOKIE_NAME = 'k710_member_session';

// 12 hours, matching the cookie's own maxAge in member-login/member-register -
// the expiry lives inside the signed token itself now, not just the cookie
// jar, so a copied cookie value can't be replayed past its window even if
// it's presented directly to an API route instead of through the browser.
export const MEMBER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  return process.env.MEMBER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_PASSWORD || '';
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Length-independent equality, same rationale as lib/adminAuth.js: this
// module also runs on the edge runtime via middleware.js, where
// node:crypto's timingSafeEqual isn't available.
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

export async function createMemberToken(memberId) {
  const clean = String(memberId || '').trim();
  const secret = getSecret();
  if (!clean || !secret) throw new Error('Member sessions are not configured.');
  const nonce = crypto.randomUUID();
  const exp = Date.now() + MEMBER_TOKEN_TTL_MS;
  const payload = toBase64Url(JSON.stringify({ memberId: clean, nonce, exp }));
  const signature = await sha256Hex(`k710-member-v2:${payload}:${secret}`);
  return `${payload}.${signature}`;
}

export async function readMemberSession(request) {
  const raw = request.cookies.get(MEMBER_COOKIE_NAME)?.value || '';
  const secret = getSecret();
  if (!raw || !secret) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = await sha256Hex(`k710-member-v2:${payload}:${secret}`);
  if (!safeEqual(signature, expected)) return null;

  try {
    const { memberId, exp } = JSON.parse(fromBase64Url(payload));
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    const clean = String(memberId || '').trim();
    return clean && clean.length <= 120 ? { memberId: clean } : null;
  } catch {
    return null;
  }
}
