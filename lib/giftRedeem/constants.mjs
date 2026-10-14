// Gift code auto-redeem constants.
//
// These values MIRROR the owner's Discord bot (src/kingshot.js) one-to-one and MUST NOT be lowered,
// "tuned" or shortened: the delays exist so the game's gift code service is not hammered, and
// the same pacing is what has been working for the bot. Raising them is fine; lowering them is not.

/** Status mapping for the game's `err_code` field. Anything else is "unknown". */
export const STATUS_MAP = Object.freeze({
  20000: 'success',
  40001: 'login_failed',
  40008: 'received',
  40007: 'expired',
  40017: 'recharge',
});

/** Sleep after EVERY player (also after the last one), in ms. */
export const DEFAULT_DELAY_MS = 800;
/** Sleep between attempts for the same player, in ms. */
export const RETRY_DELAY_MS = 3000;
/** Attempts per player per code. */
export const MAX_RETRIES = 5;
/** Extra pause after every Nth player processed in a code run. */
export const BULK_PAUSE_EVERY = 15;
export const BULK_PAUSE_MS = 5000;

/** Final statuses that may be stored for a (code, player) pair. */
export const FINAL_STATUSES = Object.freeze(['success', 'received', 'expired', 'unknown', 'login_failed', 'skipped']);

export const REAL_GIFT_ENDPOINT = 'https://kingshot-giftcode.centurygame.com/api/gift_code';

// Same request headers as the bot (the body is form-encoded).
export const REQUEST_HEADERS = Object.freeze({
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://kingshot-giftcode.centurygame.com',
  Referer: 'https://kingshot-giftcode.centurygame.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});

// --- Serverless settings (not part of the bot) ---
/** Per-request network timeout. A timeout behaves like the bot's network error: the player becomes "skipped". */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Wall-clock budget of ONE invocation. The route's maxDuration is 300 s; 200 s leaves room for the last player and cleanup. */
export const DEFAULT_BUDGET_MS = 200_000;
export const MIN_BUDGET_MS = 10_000;
export const MAX_BUDGET_MS = 780_000;
/** The lease outlives the budget by this much so a slow final player cannot see a second run start. */
export const LEASE_MARGIN_MS = 120_000;
/** A chained run may re-trigger itself at most this many times in a row (safety against loops). */
export const MAX_CHAIN_DEPTH = 40;
export const KINGDOM_ID_DEFAULT = '710';
