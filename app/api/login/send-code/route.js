import { NextResponse } from 'next/server';
import { KingshotLoginError, sendVerificationCode } from '../../../../lib/kingshotLogin';
import {
  LOGIN_FLOW_COOKIE_NAME,
  loginFlowCookieOptions,
  readLoginFlow,
  sealLoginFlow,
} from '../../../../lib/kingshotLoginState';
import { isCodeRequestRateLimited, recordLoginEvent } from '../../../../lib/kingshotLoginAudit';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function personalCodeFallback(flow, message, code, status = 400) {
  const nextFlow = {
    ...flow,
    state: 'awaiting_personal_code',
    failedPersonalCodeAttempts: 0,
  };
  const response = json(
    {
      error: message,
      code,
      personalCodeAllowed: true,
      state: nextFlow.state,
    },
    { status }
  );
  response.cookies.set(
    LOGIN_FLOW_COOKIE_NAME,
    sealLoginFlow(nextFlow),
    loginFlowCookieOptions()
  );
  return response;
}

export async function POST(request) {
  const flow = readLoginFlow(request);
  if (!flow) {
    return json(
      { error: 'Your login attempt expired. Enter your Player ID again.' },
      { status: 401 }
    );
  }

  try {
    if (await isCodeRequestRateLimited(request, flow.playerId)) {
      return personalCodeFallback(
        flow,
        'Too many verification codes were requested. Use your personal code or try again later.',
        'CODE_LIMIT',
        429
      );
    }

    await recordLoginEvent(request, 'code_requested', flow.playerId);
    const nextFlow = await sendVerificationCode(flow);
    const response = json({ ok: true, state: nextFlow.state });
    response.cookies.set(
      LOGIN_FLOW_COOKIE_NAME,
      sealLoginFlow(nextFlow),
      loginFlowCookieOptions()
    );
    return response;
  } catch (error) {
    if (error instanceof KingshotLoginError) {
      return personalCodeFallback(flow, error.message, error.code, error.status);
    }
    return personalCodeFallback(
      flow,
      'The verification code could not be requested. Use your personal code or try again later.',
      'CODE_REQUEST_FAILED',
      502
    );
  }
}
