import assert from 'node:assert/strict';
import {
  ADMIN_COOKIE_NAME,
  mintAdminToken,
  isValidAdminToken,
  isAdminRequest,
} from '../lib/adminAuth.js';

// Minimal stand-in for the NextRequest shape the real callers pass in.
function requestWithCookie(value) {
  return {
    cookies: {
      get: (name) => (name === ADMIN_COOKIE_NAME && value !== undefined ? { value } : undefined),
    },
  };
}

process.env.ADMIN_PASSWORD = 'shared-rally-secret';

const token = await mintAdminToken();

assert.equal(typeof token, 'string');
assert.ok(token.includes('.'), 'token should be payload.signature');

// Two mints produce different tokens (a fresh nonce each time), unlike the
// old sha256(password)-only scheme where every session was byte-identical.
const secondToken = await mintAdminToken();
assert.notEqual(token, secondToken, 'each mint should carry a fresh nonce');

assert.equal(await isValidAdminToken(token), true);
assert.equal(await isValidAdminToken(secondToken), true);
assert.equal(await isValidAdminToken('wrong-token'), false);
assert.equal(await isValidAdminToken(''), false);
assert.equal(await isValidAdminToken(null), false);
assert.equal(await isValidAdminToken(undefined), false);

// Tampering with the payload (still well-formed, wrong signature) is rejected.
const [payload] = token.split('.');
assert.equal(await isValidAdminToken(`${payload}.0`.padEnd(token.length, '0')), false);

assert.equal(await isAdminRequest(requestWithCookie(token)), true);
assert.equal(await isAdminRequest(requestWithCookie('nope')), false);
assert.equal(await isAdminRequest(requestWithCookie()), false, 'missing cookie should be rejected');

// An expired token (payload claims an exp in the past, signed correctly) is rejected.
{
  const enc = new TextEncoder();
  const expiredPayload = Buffer.from(JSON.stringify({ nonce: 'x', exp: Date.now() - 1000 }), 'utf8').toString('base64url');
  const key = await crypto.subtle.importKey('raw', enc.encode(process.env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(`tff-admin-session-v3:${expiredPayload}`));
  const signature = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await isValidAdminToken(`${expiredPayload}.${signature}`), false, 'expired token should be rejected');
}

// Fail closed: with no ADMIN_PASSWORD configured, nothing authenticates —
// not even a token that was valid a moment ago.
delete process.env.ADMIN_PASSWORD;
assert.equal(await isValidAdminToken(token), false, 'must fail closed when ADMIN_PASSWORD is unset');
assert.equal(await isAdminRequest(requestWithCookie(token)), false);
assert.equal(await mintAdminToken(), null, 'must not mint a token when ADMIN_PASSWORD is unset');

console.log('adminAuth tests passed');
