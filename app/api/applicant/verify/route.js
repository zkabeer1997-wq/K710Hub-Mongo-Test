import { NextResponse } from 'next/server';
import { KingshotLoginError, loadPlayerData, verifyLoginCode } from '../../../../lib/kingshotLogin.js';
import {
  APPLICANT_COOKIE_NAME,
  APPLICANT_FLOW_COOKIE_NAME,
  applicantCookieOptions,
  applicantFlowCookieOptions,
  buildApplicantSnapshot,
  createApplicantToken,
  isApplicantVerifyLimited,
  readApplicantFlow,
  recordApplicantEvent,
  sealApplicantFlow,
  toPublicApplicant,
} from '../../../../lib/applicantAuth.js';

// Verifies the in-game code and stores a SIGNED snapshot of the player's game
// data in the k710_applicant cookie. Writes nothing to kingshot_users or
// kingshot_sessions and never sets the member cookie. No kingdom restriction.
function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

const STATS_UNAVAILABLE = {
  error: 'Your code was right, but we could not read your game data just now. Try again in a minute, or apply without verifying.',
  code: 'STATS_UNAVAILABLE',
  retryAllowed: true,
};

export async function POST(request) {
  const flow = readApplicantFlow(request);
  if (!flow) {
    return json({ error: 'Your verification attempt expired. Enter your Player ID again.', code: 'FLOW_EXPIRED' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    if (await isApplicantVerifyLimited(request, flow.playerId)) {
      return json(
        { error: 'Too many incorrect codes. Please try again later, or apply without verifying.', code: 'VERIFY_LIMIT', retryAllowed: false },
        { status: 429 }
      );
    }

    const { officialResponse, officialProfile } = await verifyLoginCode(flow, body?.code);

    let playerData;
    try {
      playerData = await loadPlayerData(flow.playerId);
    } catch {
      // The code was right but the game data is unreachable. Keep the flow so
      // the person can try again; never create a snapshot we cannot fill.
      return json(STATS_UNAVAILABLE, { status: 502 });
    }

    const snapshot = buildApplicantSnapshot({
      playerId: flow.playerId,
      officialProfile,
      officialResponse,
      ...playerData,
    });
    if (!snapshot) return json(STATS_UNAVAILABLE, { status: 502 });

    await recordApplicantEvent(request, 'applicant_verified', flow.playerId, { kingdomId: snapshot.kingdomId });
    const response = json({ ok: true, state: 'verified', profile: toPublicApplicant(snapshot) });
    response.cookies.set(APPLICANT_COOKIE_NAME, createApplicantToken(snapshot), applicantCookieOptions());
    response.cookies.set(APPLICANT_FLOW_COOKIE_NAME, '', applicantFlowCookieOptions(0));
    return response;
  } catch (error) {
    if (error instanceof KingshotLoginError) {
      if (error.code === 'CODE_ERROR') {
        const failedCodeAttempts = (flow.failedCodeAttempts || 0) + 1;
        await recordApplicantEvent(request, 'applicant_verification_failed', flow.playerId, { attempt: failedCodeAttempts });
        const retryAllowed = failedCodeAttempts < 5;
        const response = json(
          {
            error: retryAllowed ? error.message : 'Too many incorrect codes. Start a new verification.',
            code: error.code,
            retryAllowed,
          },
          { status: error.status }
        );
        if (retryAllowed) {
          response.cookies.set(APPLICANT_FLOW_COOKIE_NAME, sealApplicantFlow({ ...flow, failedCodeAttempts }), applicantFlowCookieOptions());
        } else {
          response.cookies.set(APPLICANT_FLOW_COOKIE_NAME, '', applicantFlowCookieOptions(0));
        }
        return response;
      }
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Applicant verification failed unexpectedly.', error);
    return json(
      { error: 'We could not finish verifying you. Please try again, or apply without verifying.', code: 'VERIFY_FAILED' },
      { status: 500 }
    );
  }
}
