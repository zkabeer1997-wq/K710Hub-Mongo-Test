import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME } from '../../../lib/adminAuth';
import {
  MEMBER_COOKIE_NAME,
  memberSessionCookieOptions,
  readKingshotSession,
  revokeMemberSession,
} from '../../../lib/memberAuthKingshot';
import {
  LOGIN_FLOW_COOKIE_NAME,
  loginFlowCookieOptions,
} from '../../../lib/kingshotLoginState';

export async function POST(request) {
  try {
    const member = await readKingshotSession(request);
    if (member) await revokeMemberSession(request);
  } catch {
    /* best-effort */
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  response.cookies.set(MEMBER_COOKIE_NAME, '', memberSessionCookieOptions(0));
  response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
  return response;
}
