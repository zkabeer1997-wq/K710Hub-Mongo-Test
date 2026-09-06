import { NextResponse } from 'next/server';
import {
  readKingshotSession,
  revokeMemberSession,
} from '../../../lib/memberAuthKingshot';
import { clearAllAuthCookies } from '../../../lib/authCookies';
import { recordLoginEvent } from '../../../lib/kingshotLoginAudit';

export async function POST(request) {
  const member = await readKingshotSession(request);
  try {
    await revokeMemberSession(request);
  } catch (error) {
    console.error('Member session revocation failed.', error);
  }
  if (member) await recordLoginEvent(request, 'logout', member.playerId);

  const response = NextResponse.json({ ok: true });
  response.headers.set('Cache-Control', 'no-store');
  return clearAllAuthCookies(response);
}
