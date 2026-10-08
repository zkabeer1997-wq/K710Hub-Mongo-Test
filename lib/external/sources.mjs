// Fixed, known third-party URLs. Nothing user-controlled ever reaches a fetch.
export const KINGDOM = 710;

export const OPTIMIZER_HOST = 'kingshotoptimizer.com';
export const ATLAS_HOST = 'ks-atlas.com';
export const GIFT_HOST_NET = 'kingshot.net';
export const GIFT_HOST_MASTERY = 'kingshotmastery.com';
export const ALLOWED_HOSTS = [OPTIMIZER_HOST, ATLAS_HOST, GIFT_HOST_NET, GIFT_HOST_MASTERY];

// Human-facing pages (used for attribution links).
export const PAGES = {
  timeline: `https://${OPTIMIZER_HOST}/kingdom-timeline/${KINGDOM}/`,
  kingdom: `https://${OPTIMIZER_HOST}/kvk-rankings/kingdom/${KINGDOM}`,
  rankings: `https://${OPTIMIZER_HOST}/kvk-rankings/`,
  matchups: `https://${OPTIMIZER_HOST}/kvk-rankings/matchups/`,
  atlas: `https://${ATLAS_HOST}/kingdom/${KINGDOM}`,
};

// The JSON endpoints the Optimizer's own pages call (same-origin, POST, no auth).
export const OPTIMIZER_API = {
  timeline: { url: `https://${OPTIMIZER_HOST}/api/kvk-timeline`, body: { kingdomId: KINGDOM } },
  kingdom: { url: `https://${OPTIMIZER_HOST}/api/kvk-rankings`, body: { type: 'kingdom', kingdomId: KINGDOM } },
  matchups: { url: `https://${OPTIMIZER_HOST}/api/kvk-rankings`, body: { type: 'featured-matchups' } },
};

export const SNAPSHOT_KEYS = {
  timeline: `optimizer:timeline:${KINGDOM}`,
  kingdom: `optimizer:kingdom:${KINGDOM}`,
  matchups: 'optimizer:matchups',
  atlas: `atlas:kingdom:${KINGDOM}`,
  override: 'override:kvk',
};

export const FRESH_MS = 60 * 60 * 1000; // never fetch on a request while the snapshot is younger
export const MIN_ATTEMPT_MS = 30 * 60 * 1000; // at most one attempt per source per 30 min
export const STALE_MS = 6 * 60 * 60 * 1000; // show a stale notice beyond this
export const FETCH_TIMEOUT_MS = 8000;

export function userAgent(siteUrl = process.env.SITE_URL || 'https://k710hubtesting.vercel.app') {
  return `K710Hub-KingdomSite/1.0 (+${String(siteUrl).replace(/\/+$/, '')})`;
}
