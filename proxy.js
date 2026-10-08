import { NextResponse } from 'next/server';
import { isAdminRequest } from './lib/adminAuth';
import { readMemberSession } from './lib/memberAuth';
import { rejectCrossOriginMutation } from './lib/sameOrigin.js';
import { resolveAlias } from './lib/routeAliases.mjs';
import { loadProxyAliasMap } from './lib/routeAliasesProxy.mjs';

// An explicit allowlist, not a denylist: the matcher below covers every
// route in either protected set, and any route added to Waves 2-4 that
// isn't listed here simply isn't matched at all - Next.js only runs
// this proxy on matched routes, so an unlisted route silently passes
// through with no gate. That's still a real gap (a route added later has
// to be added here too), but it's a narrower one than a single hand-rolled
// regex that has to positively identify every public path; this way, the
// two lists below are the only places "does this route need a session"
// is decided.
//
// /dashboard itself (the Gatehouse login/register screen) is
// deliberately NOT in ADMIN or MEMBER prefixes below: it's where an
// unauthenticated visitor is supposed to land. Events and Guides are public;
// Tools and member forms still require a member session.
const ADMIN_PREFIXES = ['/admin/dashboard'];
const MEMBER_PREFIXES = [
  '/forms',
  '/dashboard/form',
  '/power-profile',
  '/flamedragon',
  '/prep-phase-backpack',
  '/tools',
];

// Runs on every page request (not /api page rendering, build assets or the favicon) so each
// response carries a per-request CSP nonce; the auth gates below still only
// apply to the ADMIN/MEMBER prefixes. Prefetches are excluded: they never
// render HTML that needs a nonce.
export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icon-.*\\.png|apple-touch-icon.png).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    // API routes: only the CSRF/Origin guard runs here (no nonce/CSP/auth
    // gating; /api CSP comes from next.config.js and each route authenticates).
    { source: '/api/:path*' },
  ],
};

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// The ONLY third-party origins pages may frame: click-to-load video players in
// guide Video blocks (YouTube privacy-enhanced embeds and Google Drive's video
// preview). Keep in sync with lib/guideLayout.mjs videoEmbedSrc(); anything else
// stays blocked (no other frame-src, default-src still 'self').
const VIDEO_FRAME_SRC = 'frame-src https://www.youtube-nocookie.com https://drive.google.com';

function buildCsp(nonce) {
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    // Nonce for every inline script; no 'unsafe-inline'. 'strict-dynamic' is
    // deliberately NOT used: Next 16 emits the segment chunk <script> for
    // loading.js boundaries without a nonce, and strict-dynamic would make
    // browsers block it ('self' covers same-origin chunks instead).
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ''}`,
    // Inline <style> blocks are used across many pages; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    VIDEO_FRAME_SRC,
  ].join('; ');
}

function withCsp(request, csp, nonce, redirectTo, rewriteTo) {
  if (redirectTo) {
    const res = NextResponse.redirect(redirectTo);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  let res;
  if (rewriteTo) {
    const url = request.nextUrl.clone();
    url.pathname = rewriteTo;
    res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

// Page addresses (SuperAdmin renames): the old canonical address redirects to
// the new one (308, never cached so a later reset cannot strand browsers);
// the new address is rewritten to the canonical path so gating below and the
// app code only ever see canonical paths.
function aliasRedirect(request, csp, target) {
  const url = request.nextUrl.clone();
  url.pathname = target;
  const res = NextResponse.redirect(url, 308);
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function proxy(request) {
  let { pathname } = request.nextUrl;

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return rejectCrossOriginMutation(request, pathname) || NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  let rewriteTo = null;
  if (!matchesPrefix(pathname, ADMIN_PREFIXES) && pathname !== '/admin' && !pathname.startsWith('/admin/')) {
    const decision = resolveAlias(pathname, await loadProxyAliasMap(request.nextUrl.origin));
    if (decision.action === 'redirect') return aliasRedirect(request, csp, decision.pathname);
    if (decision.action === 'rewrite') {
      rewriteTo = decision.pathname;
      pathname = decision.pathname;
    }
  }

  if (matchesPrefix(pathname, ADMIN_PREFIXES)) {
    if (!(await isAdminRequest(request))) {
      return withCsp(request, csp, nonce, new URL('/admin/login', request.url));
    }
    return withCsp(request, csp, nonce);
  }

  // Generated social images are public so crawlers can fetch them.
  const isSocialImage = /\/opengraph-image(-[a-z0-9]+)?$/.test(pathname);

  if (!isSocialImage && matchesPrefix(pathname, MEMBER_PREFIXES)) {
    // Kingshot login now issues the same edge-safe signed cookie format
    // as legacy PIN login, so one read covers both.
    const session = await readMemberSession(request);
    if (!session) {
      const loginUrl = new URL('/dashboard', request.url);
      loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return withCsp(request, csp, nonce, loginUrl);
    }
  }

  return withCsp(request, csp, nonce, undefined, rewriteTo);
}
