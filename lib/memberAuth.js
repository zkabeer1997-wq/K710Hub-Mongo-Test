export const MEMBER_COOKIE_NAME = 'k710_member_session';

// 30 days — matches Kingshot member session length so proxy gates and
// profile login stay in sync.
export const MEMBER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MEMBER_TOKEN_TTL_SECONDS = Math.floor(MEMBER_TOKEN_TTL_MS / 1000);

function getSecret() {
  return process.env.MEMBER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_PASSWORD || '';
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Length-independent equality, same rationale as lib/adminAuth.js: this
// module also runs on the edge runtime via proxy.js, where
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

/**
 * @param {string} memberId
 * @param {{ role?: string }} [options]
 */
export async function createMemberToken(memberId, options = {}) {
  const clean = String(memberId || '').trim();
  const secret = getSecret();
  if (!clean || !secret) throw new Error('Member sessions are not configured.');
  const role = ['member', 'admin', 'superadmin'].includes(options.role)
    ? options.role
    : 'member';
  const nonce = crypto.randomUUID();
  const exp = Date.now() + MEMBER_TOKEN_TTL_MS;
  const payload = toBase64Url(JSON.stringify({ memberId: clean, role, nonce, exp }));
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
    const { memberId, role, exp } = JSON.parse(fromBase64Url(payload));
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    const clean = String(memberId || '').trim();
    if (!clean || clean.length > 120) return null;
    const safeRole = ['member', 'admin', 'superadmin'].includes(role) ? role : 'member';
    return { memberId: clean, role: safeRole };
  } catch {
    return null;
  }
}
