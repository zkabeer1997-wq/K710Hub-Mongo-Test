import { NextResponse } from 'next/server';
import { readApplicantFlow, readApplicantFromRequest, toPublicApplicant } from '../../../../lib/applicantAuth.js';

// Current applicant state: a verified snapshot, a verification in progress, or none.
// Reads only the applicant cookies. Never looks at the member session.
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const snapshot = readApplicantFromRequest(request);
  if (snapshot) {
    return NextResponse.json({ state: 'verified', profile: toPublicApplicant(snapshot) }, { headers });
  }
  const flow = readApplicantFlow(request);
  if (flow) {
    return NextResponse.json({ state: flow.state, playerId: flow.playerId }, { headers });
  }
  return NextResponse.json({ state: 'none' }, { headers });
}
