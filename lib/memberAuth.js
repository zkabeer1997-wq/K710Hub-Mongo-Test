export const MEMBER_COOKIE_NAME = 'k710_member_session';

// 30 days — matches Kingshot member session length so proxy gates and
// profile login stay in sync.
export const MEMBER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MEMBER_TOKEN_TTL_SECONDS = Math.floor(MEMBER_TOKEN_TTL_MS / 1000);

// MEMBER_SESSION_SECRET only - no fallback to another trust domain's secret.
// A member session signed with ADMIN_PASSWORD (or any other shared secret)
// means a leak of that secret compromises both trust domains at once.
function getSecret() {
  return process.env.MEMBER_SESSION_SECRET || '';
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

// --- Server-side revocation -------------------------------------------------
// The cookie is a stateless signed token (so it stays readable without Mongo),
// but login also writes a kingshot_sessions row. When that row exists and has
// been revoked (logout) or has expired, the cookie must stop working
// everywhere. No row = legacy / PIN cookie, still accepted. Results are cached
// in-process for 30s so this is not a DB hit per request; logout clears the
// local entry immediately, other instances converge within the TTL. If Mongo
// is unreachable we fail open to the signed cookie (it still carries its own
// expiry) rather than locking every member out during an outage.
//
// Mongo is loaded with a dynamic import so this module keeps no static
// dependency on the driver (proxy.js and adminAuth.js import it).
export const SESSION_CHECK_TTL_MS = 30_000;
const SESSION_CACHE_MAX = 2000;
const sessionCheckCache = new Map();

export function invalidateMemberSessionCache(raw) {
  if (raw) sessionCheckCache.delete(raw);
  else sessionCheckCache.clear();
}

async function sessionRowAllows(raw) {
  const now = Date.now();
  const cached = sessionCheckCache.get(raw);
  if (cached && now - cached.at < SESSION_CHECK_TTL_MS) return cached.ok;

  let ok = true;
  let cacheable = true;
  try {
    const { getCollection } = await import('./mongo.js');
    const coll = await getCollection('kingshot_sessions');
    const row = await coll.findOne(
      { token_hash: await sha256Hex(raw) },
      { projection: { revoked_at: 1, expires_at: 1 } }
    );
    if (row) {
      ok = !row.revoked_at && new Date(row.expires_at).getTime() > now;
    }
  } catch {
    ok = true;
    cacheable = false; // retry the store on the next request
  }
  if (cacheable) {
    if (sessionCheckCache.size >= SESSION_CACHE_MAX) {
      sessionCheckCache.delete(sessionCheckCache.keys().next().value);
    }
    sessionCheckCache.set(raw, { ok, at: now });
  }
  return ok;
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
    if (!(await sessionRowAllows(raw))) return null;
    const safeRole = ['member', 'admin', 'superadmin'].includes(role) ? role : 'member';
    return { memberId: clean, role: safeRole };
  } catch {
    return null;
  }
}
