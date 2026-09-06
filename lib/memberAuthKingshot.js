/**
 * Kingshot-style opaque DB sessions (Mongo).
 * Separate from the legacy signed-cookie memberAuth.js used by PIN login.
 */
import crypto from 'node:crypto';
import { getCollection } from './mongo.js';
import { getMemberSessionSecret } from './memberSessionSecret.js';

export const MEMBER_COOKIE_NAME = 'k710_member_session';
export const MEMBER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MEMBER_TOKEN_TTL_MS = MEMBER_TOKEN_TTL_SECONDS * 1000;

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

export async function createMemberSession(playerId, request) {
  const clean = String(playerId || '').trim();
  if (!/^\d{4,20}$/.test(clean) || !getSecret()) {
    throw new Error('Member sessions are not configured.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = memberSessionExpiresAt();
  const forwarded = requestHeader(request, 'x-forwarded-for').split(',')[0].trim();
  const ip = forwarded || requestHeader(request, 'x-real-ip');
  const userAgent = requestHeader(request, 'user-agent');

  const coll = await getCollection('kingshot_sessions');
  await coll.insertOne({
    token_hash: tokenHash(token),
    player_id: clean,
    expires_at: expiresAt,
    source_fingerprint: privateFingerprint(ip, 'source'),
    user_agent_fingerprint: privateFingerprint(userAgent, 'user-agent'),
    created_at: new Date(),
    revoked_at: null,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function readKingshotSession(request) {
  const raw = request?.cookies?.get(MEMBER_COOKIE_NAME)?.value || '';
  if (!raw || !getSecret()) return null;

  try {
    const sessions = await getCollection('kingshot_sessions');
    const storedSession = await sessions.findOne({
      token_hash: tokenHash(raw),
      revoked_at: null,
    });
    if (!storedSession) return null;
    if (new Date(storedSession.expires_at).getTime() <= Date.now()) return null;

    const users = await getCollection('kingshot_users');
    const user = await users.findOne({ player_id: storedSession.player_id });
    if (!user || Number(user.kingdom_id) !== 710) return null;

    return {
      memberId: String(user.player_id),
      playerId: String(user.player_id),
      nickname: String(user.nickname || ''),
      avatarUrl: String(user.avatar_url || ''),
      kingdomId: Number(user.kingdom_id),
      role: String(user.access_role || 'member'),
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
  } catch {
    return null;
  }
}

export async function revokeMemberSession(request) {
  const raw = request?.cookies?.get(MEMBER_COOKIE_NAME)?.value || '';
  if (!raw || !getSecret()) return;
  const coll = await getCollection('kingshot_sessions');
  await coll.updateOne(
    { token_hash: tokenHash(raw) },
    { $set: { revoked_at: new Date() } }
  );
}
