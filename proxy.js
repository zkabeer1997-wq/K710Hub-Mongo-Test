import { NextResponse } from 'next/server';
import { isAdminRequest } from './lib/adminAuth';
import { readMemberSession } from './lib/memberAuth';

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
// /player-record itself (the Gatehouse login/register screen) is
// deliberately NOT in ADMIN or MEMBER prefixes below: it's where an
// unauthenticated visitor is supposed to land. Events and Guides are public;
// Tools and member forms still require a member session.
const ADMIN_PREFIXES = ['/admin/dashboard'];
const MEMBER_PREFIXES = [
  '/forms',
  '/player-record/form',
  '/power-profile',
  '/flamedragon',
  '/prep-phase-backpack',
  '/tools',
];

export const config = {
  matcher: [
    '/admin/dashboard',
    '/admin/dashboard/:path*',
    '/forms',
    '/forms/:path*',
    '/player-record/form',
    '/player-record/form/:path*',
    '/power-profile',
    '/power-profile/:path*',
    '/flamedragon',
    '/flamedragon/:path*',
    '/prep-phase-backpack',
    '/prep-phase-backpack/:path*',
    '/tools',
    '/tools/:path*',
  ],
};

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (matchesPrefix(pathname, ADMIN_PREFIXES)) {
    if (!(await isAdminRequest(request))) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (matchesPrefix(pathname, MEMBER_PREFIXES)) {
    const session = await readMemberSession(request);
    if (!session) {
      const loginUrl = new URL('/player-record', request.url);
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}
