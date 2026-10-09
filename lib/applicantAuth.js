/**
 * Applicant verification for /interest.
 *
 * This is a SEPARATE trust domain from member login. It deliberately shares no
 * cookie, no collection and no signing context with lib/memberAuth*.js:
 *
 *   - cookie `k710_applicant`        (member cookie is `k710_member_session`)
 *   - cookie `k710_applicant_flow`   (member flow cookie is `k710_kingshot_login`)
 *   - signing context `k710-applicant-v1:` (member tokens use `k710-member-v2:`)
 *   - flow-cookie key context `k710-applicant-flow:` (member: `k710-login-flow:`)
 *   - audit event types `applicant_*` (member throttles count other types)
 *
 * It never reads or writes kingshot_users, kingshot_sessions or the personal
 * code collections, and never touches the member cookie. The only things it
 * reuses from the member code are the game-API helpers in lib/kingshotLogin.js
 * (stateless network calls) and the MEMBER_SESSION_SECRET value, always mixed
 * with its own domain-separation prefix.
 *
 * Server-only (node:crypto). Not imported by proxy.js.
 */
import crypto from 'node:crypto';
import { getCollection } from './mongo.js';
import { getMemberSessionSecret } from './memberSessionSecret.js';
import { deriveKingdomId, toStoredUser } from './kingshotLogin.js';

export const APPLICANT_COOKIE_NAME = 'k710_applicant';
export const APPLICANT_FLOW_COOKIE_NAME = 'k710_applicant_flow';
export const APPLICANT_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;
export const APPLICANT_TOKEN_TTL_SECONDS = Math.floor(APPLICANT_TOKEN_TTL_MS / 1000);
export const APPLICANT_FLOW_TTL_SECONDS = 15 * 60;
export const APPLICANT_SIGNING_PREFIX = 'k710-applicant-v1:';
const FLOW_KEY_PREFIX = 'k710-applicant-flow:';

const POWER_MAX = 3_000_000_000;

function secretOrEmpty() {
  return getMemberSessionSecret();
}

export function isApplicantConfigured() {
  return Boolean(secretOrEmpty());
}

export class ApplicantConfigurationError extends Error {
  constructor() {
    super('Verification is not available right now. You can still apply without verifying.');
    this.name = 'ApplicantConfigurationError';
  }
}

function requireSecret() {
  const secret = secretOrEmpty();
  if (!secret) throw new ApplicantConfigurationError();
  return secret;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "[ABC] Name", "ABC", "Name" or "None". */
export function allianceLabel(abbr, name) {
  const a = String(abbr || '').trim();
  const n = String(name || '').trim();
  if (a && n) return `[${a}] ${n}`;
  return a || n || 'None';
}

/**
 * Builds the verified snapshot from the game's answers. Pure apart from reading
 * the clock. Power / Mystic Trial that are missing or unusable stay null: the
 * form then asks the person to type them and marks them self-reported.
 */
export function buildApplicantSnapshot({ playerId, officialProfile, officialResponse, searchResponse, searchMatch, profileResponse }, now = Date.now()) {
  const kingdomId = deriveKingdomId({ officialProfile, searchMatch, profileResponse });
  if (!kingdomId) return null;
  const user = toStoredUser({ playerId, officialProfile, officialResponse, searchResponse, searchMatch, profileResponse, kingdomId });
  const rawPower = numberOrNull(user.power);
  const power = rawPower !== null && Number.isFinite(rawPower) && Math.round(rawPower) >= 1 && Math.round(rawPower) <= POWER_MAX ? Math.round(rawPower) : null;
  const rawMystic = numberOrNull(user.mystic_trial);
  const mysticTrial = rawMystic !== null && Math.round(rawMystic) >= 0 ? Math.round(rawMystic) : null;
  return {
    playerId: String(playerId),
    nickname: String(user.nickname || '').slice(0, 120),
    kingdomId,
    allianceAbbr: String(user.alliance_abbr || '').slice(0, 40),
    allianceName: String(user.alliance_name || '').slice(0, 120),
    power,
    mysticTrial,
    fetchedAt: now,
    expiresAt: now + APPLICANT_TOKEN_TTL_MS,
  };
}

// ---------------------------------------------------------------- token ----

function b64(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signature(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(`${APPLICANT_SIGNING_PREFIX}${payloadB64}`).digest('base64url');
}

export function createApplicantToken(snapshot) {
  const secret = requireSecret();
  const body = {
    typ: 'k710-applicant',
    v: 1,
    playerId: String(snapshot.playerId),
    nickname: String(snapshot.nickname || ''),
    kingdomId: numberOrNull(snapshot.kingdomId),
    allianceAbbr: String(snapshot.allianceAbbr || ''),
    allianceName: String(snapshot.allianceName || ''),
    power: numberOrNull(snapshot.power),
    mysticTrial: numberOrNull(snapshot.mysticTrial),
    fetchedAt: Number(snapshot.fetchedAt),
    expiresAt: Number(snapshot.expiresAt),
  };
  const payload = b64(JSON.stringify(body));
  return `${payload}.${signature(payload, secret)}`;
}

/** Returns the verified snapshot, or null for anything missing/forged/expired. */
export function verifyApplicantToken(raw, now = Date.now()) {
  const secret = secretOrEmpty();
  const value = String(raw || '');
  if (!secret || !value || value.length > 4096) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig || !safeEqual(sig, signature(payload, secret))) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (body?.typ !== 'k710-applicant' || body?.v !== 1) return null;
    if (!Number.isFinite(body.expiresAt) || body.expiresAt <= now) return null;
    if (!Number.isFinite(body.fetchedAt) || body.fetchedAt > now + 60_000) return null;
    if (!/^\d{4,20}$/.test(String(body.playerId || ''))) return null;
    if (!Number.isInteger(body.kingdomId) || body.kingdomId <= 0) return null;
    return {
      playerId: String(body.playerId),
      nickname: String(body.nickname || ''),
      kingdomId: body.kingdomId,
      allianceAbbr: String(body.allianceAbbr || ''),
      allianceName: String(body.allianceName || ''),
      power: numberOrNull(body.power),
      mysticTrial: numberOrNull(body.mysticTrial),
      fetchedAt: body.fetchedAt,
      expiresAt: body.expiresAt,
    };
  } catch {
    return null;
  }
}

function cookieFromHeader(request, name) {
  const header = request?.headers?.get?.('cookie') || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}

function readCookie(request, name) {
  const fromJar = request?.cookies?.get?.(name)?.value;
  return fromJar || cookieFromHeader(request, name) || '';
}

/** Reads ONLY the applicant cookie. Never looks at the member cookie. */
export function readApplicantFromRequest(request) {
  return verifyApplicantToken(readCookie(request, APPLICANT_COOKIE_NAME));
}

export function applicantCookieOptions(maxAge = APPLICANT_TOKEN_TTL_SECONDS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge };
}

export function applicantFlowCookieOptions(maxAge = APPLICANT_FLOW_TTL_SECONDS) {
  return applicantCookieOptions(maxAge);
}

/** What the browser may see (no secrets, no cookies). */
export function toPublicApplicant(snapshot) {
  if (!snapshot) return null;
  return {
    playerId: snapshot.playerId,
    nickname: snapshot.nickname,
    kingdomId: snapshot.kingdomId,
    alliance: allianceLabel(snapshot.allianceAbbr, snapshot.allianceName),
    power: snapshot.power,
    mysticTrial: snapshot.mysticTrial,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
  };
}

// ----------------------------------------------------------------- flow ----

function flowKey() {
  return crypto.createHash('sha256').update(`${FLOW_KEY_PREFIX}${requireSecret()}`).digest();
}

export function sealApplicantFlow(flow) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', flowKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(flow), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function openApplicantFlow(value) {
  try {
    if (!secretOrEmpty()) return null;
    const [ivValue, tagValue, ciphertextValue] = String(value || '').split('.');
    if (!ivValue || !tagValue || !ciphertextValue) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', flowKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const flow = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8'));
    if (!Number.isFinite(flow?.expiresAt) || flow.expiresAt <= Date.now()) return null;
    if (!/^\d{4,20}$/.test(String(flow?.playerId || ''))) return null;
    if (!['awaiting_game_confirmation', 'awaiting_code'].includes(flow?.state)) return null;
    if (flow.applicant !== true) return null;
    return flow;
  } catch {
    return null;
  }
}

export function readApplicantFlow(request) {
  return openApplicantFlow(readCookie(request, APPLICANT_FLOW_COOKIE_NAME));
}

// ---------------------------------------------------------------- audit ----

function fingerprint(value, purpose) {
  const secret = secretOrEmpty();
  if (!value || !secret) return null;
  return crypto.createHash('sha256').update(`${purpose}:${secret}:${value}`).digest('hex');
}

function sourceIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';
}

const EVENTS = 'kingshot_login_events';

export async function recordApplicantEvent(request, eventType, playerId, metadata = {}) {
  try {
    const coll = await getCollection(EVENTS);
    await coll.insertOne({
      player_id_fingerprint: fingerprint(String(playerId || ''), 'applicant-player'),
      source_fingerprint: fingerprint(sourceIp(request), 'applicant-source'),
      event_type: eventType,
      metadata,
      occurred_at: new Date(),
    });
  } catch {
    // Audit must never replace the primary error.
  }
}

async function overLimit(request, playerId, eventType, perPlayer, perSource) {
  try {
    const coll = await getCollection(EVENTS);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const playerFp = fingerprint(String(playerId || ''), 'applicant-player');
    const sourceFp = fingerprint(sourceIp(request), 'applicant-source');
    if (!playerFp) return true;
    const playerCount = await coll.countDocuments({ event_type: eventType, player_id_fingerprint: playerFp, occurred_at: { $gte: since } });
    const sourceCount = sourceFp
      ? await coll.countDocuments({ event_type: eventType, source_fingerprint: sourceFp, occurred_at: { $gte: since } })
      : 0;
    return playerCount >= perPlayer || sourceCount >= perSource;
  } catch {
    // Fail closed, like the member throttle.
    return true;
  }
}

/** Same limits as member code requests (4 per player, 10 per source, per hour), counted separately. */
export function isApplicantCodeRequestLimited(request, playerId) {
  return overLimit(request, playerId, 'applicant_code_requested', 4, 10);
}

/** Same limits as the member failed-code throttle (10 / 25 per hour), counted separately. */
export function isApplicantVerifyLimited(request, playerId) {
  return overLimit(request, playerId, 'applicant_verification_failed', 10, 25);
}
