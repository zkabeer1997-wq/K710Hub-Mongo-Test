// One source of truth for the public origin (canonical URLs, sitemap, robots,
// JSON-LD). Set SITE_URL per deployment; falls back to the testing site.
export const SITE_URL = (process.env.SITE_URL || 'https://k710hubtesting.vercel.app').replace(/\/+$/, '');
