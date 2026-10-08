import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  TOKEN_TTL_MS,
  mintAdminToken,
  safeEqualStrings,
} from '../../../lib/adminAuth';
import { clientIp, isRateLimited } from '../../../lib/rateLimit.mjs';

export async function POST(request) {
  if (isRateLimited(`admin-login:${clientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 8 })) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const password = typeof body?.password === 'string' ? body.password : '';
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword || !password || !safeEqualStrings(password, expectedPassword)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await mintAdminToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_MS / 1000,
  });
  return response;
}
