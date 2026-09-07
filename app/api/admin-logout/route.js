import { NextResponse } from 'next/server';
import {
  readKingshotSession,
  revokeMemberSession,
} from '../../../lib/memberAuthKingshot';
import { clearAllAuthCookies } from '../../../lib/authCookies';

export async function POST(request) {
  try {
    const member = await readKingshotSession(request);
    if (member) await revokeMemberSession(request);
  } catch {
    /* best-effort */
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set('Cache-Control', 'no-store');
  return clearAllAuthCookies(response);
}
