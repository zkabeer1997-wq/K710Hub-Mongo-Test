import { NextResponse } from 'next/server';
import { createLoginFlow, KingshotLoginError } from '../../../../lib/kingshotLogin.js';
import {
  APPLICANT_FLOW_COOKIE_NAME,
  ApplicantConfigurationError,
  applicantFlowCookieOptions,
  isApplicantConfigured,
  sealApplicantFlow,
} from '../../../../lib/applicantAuth.js';

// Applicant verification for /interest. Separate from /api/login/*: own flow
// cookie, own audit events, never touches member sessions.
function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request) {
  try {
    if (!isApplicantConfigured()) throw new ApplicantConfigurationError();
    const body = await request.json();
    const flow = { ...createLoginFlow(body?.playerId), applicant: true };
    const response = json({ ok: true, state: flow.state });
    response.cookies.set(APPLICANT_FLOW_COOKIE_NAME, sealApplicantFlow(flow), applicantFlowCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof KingshotLoginError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof ApplicantConfigurationError) {
      return json({ error: error.message, code: 'VERIFY_NOT_CONFIGURED' }, { status: 503 });
    }
    return json({ error: 'Invalid request.' }, { status: 400 });
  }
}
