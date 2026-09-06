import crypto from 'node:crypto';
import { getCollection } from './mongo.js';
import { getMemberSessionSecret } from './memberSessionSecret.js';

function secret() {
  return getMemberSessionSecret();
}

function fingerprint(value, purpose) {
  if (!value || !secret()) return null;
  return crypto
    .createHash('sha256')
    .update(`${purpose}:${secret()}:${value}`)
    .digest('hex');
}

function sourceIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  );
}

export async function recordLoginEvent(request, eventType, playerId, metadata = {}) {
  try {
    const coll = await getCollection('kingshot_login_events');
    await coll.insertOne({
      player_id_fingerprint: fingerprint(String(playerId || ''), 'player'),
      source_fingerprint: fingerprint(sourceIp(request), 'source'),
      event_type: eventType,
      metadata,
      occurred_at: new Date(),
    });
  } catch {
    // Audit must never replace the primary error.
  }
}

export async function isCodeRequestRateLimited(request, playerId) {
  try {
    const coll = await getCollection('kingshot_login_events');
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const playerFingerprint = fingerprint(String(playerId || ''), 'player');
    const sourceFingerprint = fingerprint(sourceIp(request), 'source');
    const playerCount = await coll.countDocuments({
      event_type: 'code_requested',
      player_id_fingerprint: playerFingerprint,
      occurred_at: { $gte: since },
    });
    const sourceCount = sourceFingerprint
      ? await coll.countDocuments({
          event_type: 'code_requested',
          source_fingerprint: sourceFingerprint,
          occurred_at: { $gte: since },
        })
      : 0;
    return playerCount >= 4 || sourceCount >= 10;
  } catch {
    return false;
  }
}

export async function isPersonalCodeRateLimited(request, playerId) {
  try {
    const coll = await getCollection('kingshot_login_events');
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const playerFingerprint = fingerprint(String(playerId || ''), 'player');
    const sourceFingerprint = fingerprint(sourceIp(request), 'source');
    const playerCount = await coll.countDocuments({
      event_type: 'verification_failed',
      player_id_fingerprint: playerFingerprint,
      occurred_at: { $gte: since },
    });
    const sourceCount = sourceFingerprint
      ? await coll.countDocuments({
          event_type: 'verification_failed',
          source_fingerprint: sourceFingerprint,
          occurred_at: { $gte: since },
        })
      : 0;
    return playerCount >= 10 || sourceCount >= 25;
  } catch {
    return false;
  }
}
