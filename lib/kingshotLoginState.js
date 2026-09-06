import crypto from 'node:crypto';
import { requireMemberSessionSecret } from './memberSessionSecret.js';

export const LOGIN_FLOW_COOKIE_NAME = 'k710_kingshot_login';
export const LOGIN_FLOW_TTL_SECONDS = 15 * 60;

function encryptionKey() {
  const secret = requireMemberSessionSecret();
  return crypto.createHash('sha256').update(`k710-login-flow:${secret}`).digest();
}

export function sealLoginFlow(flow) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(flow), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function openLoginFlow(value) {
  try {
    const [ivValue, tagValue, ciphertextValue] = String(value || '').split('.');
    if (!ivValue || !tagValue || !ciphertextValue) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const flow = JSON.parse(plaintext);
    if (!Number.isFinite(flow?.expiresAt) || flow.expiresAt <= Date.now()) return null;
    if (!/^\d{4,20}$/.test(String(flow?.playerId || ''))) return null;
    if (
      !['awaiting_game_confirmation', 'awaiting_code', 'awaiting_personal_code'].includes(
        flow?.state
      )
    ) {
      return null;
    }
    return flow;
  } catch {
    return null;
  }
}

export function readLoginFlow(request) {
  return openLoginFlow(request.cookies.get(LOGIN_FLOW_COOKIE_NAME)?.value || '');
}

export function loginFlowCookieOptions(maxAge = LOGIN_FLOW_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
