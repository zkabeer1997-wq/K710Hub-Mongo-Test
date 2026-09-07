import crypto from 'node:crypto';

const DEVELOPMENT_SECRET_SLOT = Symbol.for('k710.member-session-development-secret');

export class MemberSessionConfigurationError extends Error {
  constructor() {
    super('Member login is not configured. Set MEMBER_SESSION_SECRET on the server.');
    this.name = 'MemberSessionConfigurationError';
  }
}

// MEMBER_SESSION_SECRET only - no fallback to another trust domain's secret.
// A Kingshot session signed with ADMIN_PASSWORD (or any other shared secret)
// means a leak of that secret compromises both trust domains at once.
export function getMemberSessionSecret() {
  const configured = (process.env.MEMBER_SESSION_SECRET || '').trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'development') {
    if (!globalThis[DEVELOPMENT_SECRET_SLOT]) {
      globalThis[DEVELOPMENT_SECRET_SLOT] = crypto.randomBytes(32).toString('base64url');
    }
    return globalThis[DEVELOPMENT_SECRET_SLOT];
  }

  return '';
}

export function requireMemberSessionSecret() {
  const secret = getMemberSessionSecret();
  if (!secret) throw new MemberSessionConfigurationError();
  return secret;
}
