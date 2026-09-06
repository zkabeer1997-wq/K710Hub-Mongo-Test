import { SUPPORT_URL } from './supportLink';

/** Optional Discord invite. Set NEXT_PUBLIC_DISCORD_URL in Vercel to show Discord in the header/footer. */
export const DISCORD_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISCORD_URL) ||
  '';

export { SUPPORT_URL };
