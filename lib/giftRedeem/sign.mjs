// Request signing, ported from the bot's src/sign.js. The secret is NEVER stored in this repo:
// it comes from the GIFT_REDEEM_SIGN_SECRET environment variable and is passed in by the caller.
import { createHash } from 'node:crypto';

/** `key=value&...` over the payload's keys in sorted order (objects are JSON-stringified, like the bot). */
export function signingBase(payload) {
  return Object.keys(payload)
    .sort()
    .map((key) => {
      const value = payload[key];
      const normalized = typeof value === 'object' ? JSON.stringify(value) : value;
      return `${key}=${normalized}`;
    })
    .join('&');
}

/** Returns `{ sign, ...payload }` (sign first, exactly like the bot) where sign = md5(base + secret). */
export function appendSign(payload, secret) {
  if (!secret) throw new Error('Gift redeem signing secret is not configured.');
  const sign = createHash('md5').update(signingBase(payload) + secret).digest('hex');
  return { sign, ...payload };
}
