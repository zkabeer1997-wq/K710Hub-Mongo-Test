// A pragmatic CSP, not a strict nonce-based one: this codebase relies on
// inline <style> tags across most pages (see app/tools/page.js,
// app/alliances/[tag]/page.js, and others) and Next's own RSC hydration
// payload ships as an inline <script>, so script-src and style-src both
// need 'unsafe-inline'. A nonce-per-request CSP would remove that, but it
// means threading a nonce through every one of those inline blocks and the
// root layout's own script injection - a larger, riskier change than this
// PR's scope. What's still worth doing without that rewrite: block the
// unrelated-but-genuinely-dangerous vectors (framing, arbitrary base tags,
// cross-origin form submission, plugin content) outright.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  images: {
    // Gallery images are stored in Supabase Storage and served from
    // `https://<project-ref>.supabase.co/storage/v1/object/public/...`.
    // Matches any Supabase project rather than hardcoding one ref, since
    // production and staging projects use different refs.
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
