// Mirrors TOOL_SLUG_RENAMES in lib/toolKeys.mjs (a test keeps them in sync;
// this file is CommonJS so it cannot import the ES module directly).
const TOOL_SLUG_RENAMES = {
  'updated-hero-gear': 'hero-gear',
  'updated-governor-gear': 'governor-gear',
  'updated-charms': 'charms',
  'updated-masters': 'masters',
  'updated-pets': 'pets',
  'updated-construction': 'construction',
  'updated-research': 'research',
  'wavebound-charms': 'charm-sailing-optimizer',
  'flamedragon-shop': 'dragons-caravan-optimizer',
};

// Page CSP (nonce + strict-dynamic) is set per request in proxy.js. This
// legacy policy now only covers /api/*, which the proxy skips; the Google
// Drive OAuth callback returns a small inline <script> that needs it.
const API_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Content-Security-Policy', value: API_CSP }],
      },
    ];
  },
  async redirects() {
    return [
      // Convenience paths people expect to work that don't map to an
      // actual route today - point them at the real destination instead
      // of 404ing.
      { source: '/apply', destination: '/interest', permanent: false },
      { source: '/join', destination: '/interest', permanent: false },
      { source: '/members', destination: '/dashboard', permanent: false },
      // Renamed routes: permanent so bookmarks and search engines follow.
      { source: '/player-record', destination: '/dashboard', permanent: true },
      { source: '/player-record/:path*', destination: '/dashboard/:path*', permanent: true },
      { source: '/chronometer', destination: '/about', permanent: true },
      // Tool slugs without "Updated" / matching their card titles. Saved plans
      // keep their original storage keys (see lib/toolKeys.mjs), so only the
      // URLs move. Nested paths and query strings (member_id) are preserved.
      ...Object.entries(TOOL_SLUG_RENAMES).flatMap(([from, to]) => [
        { source: `/tools/${from}`, destination: `/tools/${to}`, permanent: true },
        { source: `/tools/${from}/:path*`, destination: `/tools/${to}/:path*`, permanent: true },
      ]),
    ];
  },
  images: {
    // Gallery may still reference historical Supabase CDN URLs from production
    // data import; keep remotePatterns so those images continue to render.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
