import { NextResponse } from 'next/server';
import { createLoginFlow, KingshotLoginError } from '../../../../lib/kingshotLogin';
import {
  LOGIN_FLOW_COOKIE_NAME,
  loginFlowCookieOptions,
  sealLoginFlow,
} from '../../../../lib/kingshotLoginState';
import { MemberSessionConfigurationError } from '../../../../lib/memberSessionSecret';
import {
  ensureInitialKingshotOwner,
  INITIAL_PERSONAL_CODE_PLAYER_ID,
  KingshotAccountBootstrapError,
} from '../../../../lib/kingshotAccountBootstrap';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const flow = createLoginFlow(body?.playerId);
    if (flow.playerId === INITIAL_PERSONAL_CODE_PLAYER_ID) {
      await ensureInitialKingshotOwner();
    }
    const response = json({ ok: true, state: flow.state });
    response.cookies.set(LOGIN_FLOW_COOKIE_NAME, sealLoginFlow(flow), loginFlowCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof KingshotLoginError) {
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof MemberSessionConfigurationError) {
      return json({ error: error.message, code: 'LOGIN_NOT_CONFIGURED' }, { status: 503 });
    }
    if (error instanceof KingshotAccountBootstrapError) {
      console.error('Initial Kingshot owner could not be prepared.', error.cause || error);
      return json(
        { error: error.message, code: 'PERSONAL_CODE_SETUP_REQUIRED' },
        { status: 503 }
      );
    }
    return json({ error: 'Invalid request.' }, { status: 400 });
  }
}
