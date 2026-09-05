import { NextResponse } from 'next/server';
import { verifyMemberPin } from '../../../lib/mongoAuth';
import { findMemberById } from '../../../lib/mongoMembers';
import { createMemberToken, MEMBER_COOKIE_NAME, MEMBER_TOKEN_TTL_MS } from '../../../lib/memberAuth';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const memberId = String(body?.memberId || '').trim();
  const pin = String(body?.pin || '');
  if (!memberId || memberId.length > 120) {
    return NextResponse.json({ error: 'Please enter a valid Member ID.' }, { status: 400 });
  }

  try {
    // Fail closed before PIN verification — same behaviour as production.
    const member = await findMemberById(memberId);
    if (!member) {
      return NextResponse.json({ error: 'Incorrect PIN for this Member ID.' }, { status: 401 });
    }

    const ok = await verifyMemberPin(memberId, pin);
    if (!ok) {
      return NextResponse.json({ error: 'Incorrect PIN for this Member ID.' }, { status: 401 });
    }

    const token = await createMemberToken(memberId);
    const response = NextResponse.json({ ok: true, memberId });
    response.cookies.set(MEMBER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MEMBER_TOKEN_TTL_MS / 1000,
    });
    return response;
  } catch (error) {
    console.error('member-login failed', error);
    return NextResponse.json({ error: 'Unable to verify member access.' }, { status: 500 });
  }
}
