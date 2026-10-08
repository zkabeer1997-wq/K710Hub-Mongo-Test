/**
 * Central auth-cookie clearing for Kingshot member sessions, login flow,
 * and admin panel cookies. Always clear the full set on logout so dual
 * residual cookies cannot keep a gate open.
 */
import { ADMIN_COOKIE_NAME } from './adminAuth.js';
import {
  MEMBER_COOKIE_NAME,
  memberSessionCookieOptions,
} from './memberAuthKingshot.js';
import {
  LOGIN_FLOW_COOKIE_NAME,
  loginFlowCookieOptions,
} from './kingshotLoginState.js';

/** Apply expired Set-Cookie headers for every auth cookie on a NextResponse. */
export function clearAllAuthCookies(response) {
  response.cookies.set(MEMBER_COOKIE_NAME, '', memberSessionCookieOptions(0));
  response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
  response.cookies.set(ADMIN_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return response;
}
