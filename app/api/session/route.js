import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { readKingshotSession } from '../../../lib/memberAuthKingshot';
import { readLoginFlow } from '../../../lib/kingshotLoginState';

export async function GET(request) {
  // Prefer Kingshot opaque sessions; fall back to legacy PIN sessions.
  const kingshot = await readKingshotSession(request);
  if (kingshot) {
    const response = NextResponse.json({ state: 'authenticated', profile: kingshot });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const legacy = await readMemberSession(request);
  if (legacy) {
    const response = NextResponse.json({
      state: 'authenticated',
      profile: {
        playerId: legacy.memberId,
        memberId: legacy.memberId,
        nickname: legacy.memberId,
        role: 'member',
        kingdomId: 710,
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const response = NextResponse.json({
    state: readLoginFlow(request)?.state || 'signed_out',
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
