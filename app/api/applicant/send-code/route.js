import { NextResponse } from 'next/server';
import { KingshotLoginError, sendVerificationCode } from '../../../../lib/kingshotLogin.js';
import {
  APPLICANT_FLOW_COOKIE_NAME,
  applicantFlowCookieOptions,
  isApplicantCodeRequestLimited,
  readApplicantFlow,
  recordApplicantEvent,
  sealApplicantFlow,
} from '../../../../lib/applicantAuth.js';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request) {
  const flow = readApplicantFlow(request);
  if (!flow) {
    return json({ error: 'Your verification attempt expired. Enter your Player ID again.', code: 'FLOW_EXPIRED' }, { status: 401 });
  }

  try {
    if (await isApplicantCodeRequestLimited(request, flow.playerId)) {
      return json(
        { error: 'Too many verification codes were requested. Please try again later, or apply without verifying.', code: 'CODE_LIMIT' },
        { status: 429 }
      );
    }

    await recordApplicantEvent(request, 'applicant_code_requested', flow.playerId);
    const nextFlow = await sendVerificationCode(flow);
    const response = json({ ok: true, state: nextFlow.state });
    response.cookies.set(APPLICANT_FLOW_COOKIE_NAME, sealApplicantFlow(nextFlow), applicantFlowCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof KingshotLoginError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    return json(
      { error: 'The verification code could not be requested. Please try again later, or apply without verifying.', code: 'CODE_REQUEST_FAILED' },
      { status: 502 }
    );
  }
}
