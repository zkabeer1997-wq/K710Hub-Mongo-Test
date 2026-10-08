/**
 * Kingshot member sessions.
 * Cookie value is the edge-safe signed token from memberAuth.js so proxy.js
 * can authorize /forms and /tools without Mongo. A Mongo session row is still
 * written for audit / optional opaque lookup.
 */
import crypto from 'node:crypto';
import { getCollection } from './mongo.js';
import { getMemberSessionSecret } from './memberSessionSecret.js';
import {
  createMemberToken,
  MEMBER_COOKIE_NAME,
  MEMBER_TOKEN_TTL_MS,
  MEMBER_TOKEN_TTL_SECONDS,
  readMemberSession,
  invalidateMemberSessionCache,
} from './memberAuth.js';

export { MEMBER_COOKIE_NAME, MEMBER_TOKEN_TTL_MS, MEMBER_TOKEN_TTL_SECONDS };

function getSecret() {
  return getMemberSessionSecret();
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function requestHeader(request, name) {
  if (typeof request?.headers?.get === 'function') return request.headers.get(name) || '';
  return request?.headers?.[name] || '';
}

function privateFingerprint(value, purpose) {
  const secret = getSecret();
  if (!value || !secret) return null;
  return crypto
    .createHash('sha256')
    .update(`${purpose}:${secret}:${value}`)
    .digest('hex');
}

export function memberSessionCookieOptions(maxAge = MEMBER_TOKEN_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function memberSessionExpiresAt(now = Date.now()) {
  return new Date(now + MEMBER_TOKEN_TTL_MS);
}

function toPublicSession(user, fallbackRole = 'member') {
  if (!user) return null;
  return {
    memberId: String(user.player_id),
    playerId: String(user.player_id),
    nickname: String(user.nickname || ''),
    avatarUrl: String(user.avatar_url || ''),
    kingdomId: Number(user.kingdom_id),
    role: String(user.access_role || fallbackRole || 'member'),
    allianceId: user.alliance_id == null ? null : Number(user.alliance_id),
    allianceAbbr: String(user.alliance_abbr || ''),
    allianceName: String(user.alliance_name || ''),
    allianceRank: user.alliance_rank == null ? null : Number(user.alliance_rank),
    power: user.power == null ? null : Number(user.power),
    kills: user.kills == null ? null : Number(user.kills),
    mysticTrial: user.mystic_trial == null ? null : Number(user.mystic_trial),
    x: user.coordinate_x == null ? null : Number(user.coordinate_x),
    y: user.coordinate_y == null ? null : Number(user.coordinate_y),
  };
}

/**
 * @param {string} playerId
 * @param {Request} request
 * @param {{ role?: string }} [options]
 */
export async function createMemberSession(playerId, request, options = {}) {
  const clean = String(playerId || '').trim();
  if (!/^\d{4,20}$/.test(clean) || !getSecret()) {
    throw new Error('Member sessions are not configured.');
  }

  const role = ['member', 'admin', 'superadmin'].includes(options.role)
    ? options.role
    : 'member';

  // Edge-safe signed cookie so proxy.js can pass /forms and /tools.
  const token = await createMemberToken(clean, { role });
  const expiresAt = memberSessionExpiresAt();
  const forwarded = requestHeader(request, 'x-forwarded-for').split(',')[0].trim();
  const ip = forwarded || requestHeader(request, 'x-real-ip');
  const userAgent = requestHeader(request, 'user-agent');

  try {
    const coll = await getCollection('kingshot_sessions');
    await coll.insertOne({
      token_hash: tokenHash(token),
      player_id: clean,
      access_role: role,
      expires_at: expiresAt,
      source_fingerprint: privateFingerprint(ip, 'source'),
      user_agent_fingerprint: privateFingerprint(userAgent, 'user-agent'),
      created_at: new Date(),
      revoked_at: null,
    });
  } catch (error) {
    console.error('Kingshot session row could not be stored.', error);
  }

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function readKingshotSession(request) {
  const raw = request?.cookies?.get(MEMBER_COOKIE_NAME)?.value || '';
  if (!raw || !getSecret()) return null;

  try {
    // Prefer Mongo session row when present (opaque or signed cookie hash).
    const sessions = await getCollection('kingshot_sessions');
    const anyRow = await sessions.findOne({ token_hash: tokenHash(raw) });
    // A row that was revoked (logout) or has expired must not fall through to
    // the stateless cookie below, or logout would not actually log anyone out.
    if (anyRow && (anyRow.revoked_at || new Date(anyRow.expires_at).getTime() <= Date.now())) {
      return null;
    }
    const storedSession = anyRow;
    if (storedSession && new Date(storedSession.expires_at).getTime() > Date.now()) {
      const users = await getCollection('kingshot_users');
      const user = await users.findOne({ player_id: storedSession.player_id });
      if (user && Number(user.kingdom_id) === 710) {
        return toPublicSession(user, storedSession.access_role);
      }
    }

    // Fall back: edge-safe signed cookie + live user profile from Mongo.
    const legacy = await readMemberSession(request);
    if (!legacy?.memberId) return null;
    const users = await getCollection('kingshot_users');
    const user = await users.findOne({ player_id: legacy.memberId });
    if (user && Number(user.kingdom_id) === 710) {
      return toPublicSession(user, legacy.role);
    }

    // Cookie is valid but profile not in kingshot_users yet (PIN-only member).
    return {
      memberId: legacy.memberId,
      playerId: legacy.memberId,
      nickname: legacy.memberId,
      avatarUrl: '',
      kingdomId: 710,
      role: legacy.role || 'member',
      allianceId: null,
      allianceAbbr: '',
      allianceName: '',
      allianceRank: null,
      power: null,
      kills: null,
      mysticTrial: null,
      x: null,
      y: null,
    };
  } catch {
    return null;
  }
}

export async function revokeMemberSession(request) {
  const raw = request?.cookies?.get(MEMBER_COOKIE_NAME)?.value || '';
  if (!raw || !getSecret()) return;
  try {
    const coll = await getCollection('kingshot_sessions');
    await coll.updateOne(
      { token_hash: tokenHash(raw) },
      { $set: { revoked_at: new Date() } }
    );
    invalidateMemberSessionCache(raw);
  } catch {
    /* best-effort */
  }
}

/**
 * Admin check backed by Mongo: the session row must be live and the role is
 * read from the user's current profile, not from the cookie, so a demoted or
 * logged-out admin loses access immediately.
 */
export async function readVerifiedElevatedRole(request) {
  const raw = request?.cookies?.get(MEMBER_COOKIE_NAME)?.value || '';
  if (!raw || !getSecret()) return null;
  try {
    const sessions = await getCollection('kingshot_sessions');
    const anyRow = await sessions.findOne({ token_hash: tokenHash(raw) });
    let playerId = null;
    if (anyRow) {
      // A stored session must be live: logged out (revoked) or expired never counts.
      if (anyRow.revoked_at || new Date(anyRow.expires_at).getTime() <= Date.now()) return null;
      playerId = anyRow.player_id;
    } else {
      // No stored row (older cookie, or the row could not be written, or another database):
      // accept the signed, unexpired cookie, exactly like readKingshotSession does, so the
      // admin gate and /api/session always agree. The role still comes from the live profile.
      const legacy = await readMemberSession(request);
      playerId = legacy?.memberId || null;
    }
    if (!playerId) return null;
    const users = await getCollection('kingshot_users');
    const user = await users.findOne({ player_id: playerId });
    const role = user?.access_role;
    return role === 'admin' || role === 'superadmin' ? role : null;
  } catch {
    return null;
  }
}
