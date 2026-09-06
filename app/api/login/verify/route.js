import { NextResponse } from 'next/server';
import { getCollection } from '../../../../lib/mongo';
import {
  deriveKingdomId,
  isLoginSuperadmin,
  KingshotLoginError,
  loadPlayerData,
  toPublicProfile,
  toStoredUser,
  verifyLoginCode,
} from '../../../../lib/kingshotLogin';
import {
  LOGIN_FLOW_COOKIE_NAME,
  loginFlowCookieOptions,
  readLoginFlow,
  sealLoginFlow,
} from '../../../../lib/kingshotLoginState';
import {
  createMemberSession,
  MEMBER_COOKIE_NAME,
  memberSessionCookieOptions,
} from '../../../../lib/memberAuthKingshot';
import { recordLoginEvent } from '../../../../lib/kingshotLoginAudit';
import { ensureInitialKingshotOwner } from '../../../../lib/kingshotAccountBootstrap';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function resolveAccessRole(playerId, existingRole) {
  if (isLoginSuperadmin(playerId)) return 'superadmin';
  if (existingRole === 'admin' || existingRole === 'superadmin') return existingRole;
  return 'member';
}

export async function POST(request) {
  const flow = readLoginFlow(request);
  if (!flow) {
    return json({ error: 'Your login attempt expired. Enter your Player ID again.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    await ensureInitialKingshotOwner();

    const { officialResponse, officialProfile } = await verifyLoginCode(flow, body?.code);
    const { searchResponse, searchMatch, profileResponse } = await loadPlayerData(flow.playerId);
    const kingdomId = deriveKingdomId({ officialProfile, searchMatch, profileResponse });

    if (kingdomId !== 710) {
      await recordLoginEvent(request, 'kingdom_denied', flow.playerId, { kingdomId });
      const response = json(
        {
          error: kingdomId
            ? `This account belongs to Kingdom ${kingdomId}. Member login is only available to Kingdom 710.`
            : 'We could not confirm that this account belongs to Kingdom 710.',
          code: 'KINGDOM_ACCESS_DENIED',
          kingdomId,
        },
        { status: 403 }
      );
      response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
      return response;
    }

    const coll = await getCollection('kingshot_users');
    const existing = await coll.findOne({ player_id: flow.playerId });

    const storedUser = toStoredUser({
      playerId: flow.playerId,
      officialProfile,
      officialResponse,
      searchResponse,
      searchMatch,
      profileResponse,
      kingdomId,
    });
    storedUser.access_role = resolveAccessRole(flow.playerId, existing?.access_role);

    await coll.updateOne(
      { player_id: flow.playerId },
      { $set: { ...storedUser, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );
    const user = await coll.findOne({ player_id: flow.playerId });
    if (!user) throw new Error('Account was not saved.');

    const session = await createMemberSession(flow.playerId, request, {
      role: user.access_role || 'member',
    });
    await recordLoginEvent(request, 'login_success', flow.playerId, { role: user.access_role });

    const response = json({ ok: true, state: 'authenticated', profile: toPublicProfile(user) });
    response.cookies.set(MEMBER_COOKIE_NAME, session.token, memberSessionCookieOptions());
    response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
    return response;
  } catch (error) {
    if (error instanceof KingshotLoginError) {
      if (error.code === 'CODE_ERROR') {
        const failedCodeAttempts = (flow.failedCodeAttempts || 0) + 1;
        await recordLoginEvent(request, 'verification_failed', flow.playerId, {
          attempt: failedCodeAttempts,
        });
        const retryAllowed = failedCodeAttempts < 5;
        const response = json(
          {
            error: retryAllowed
              ? error.message
              : 'Too many incorrect codes. Start a new login attempt.',
            code: error.code,
            retryAllowed,
          },
          { status: error.status }
        );
        if (retryAllowed) {
          response.cookies.set(
            LOGIN_FLOW_COOKIE_NAME,
            sealLoginFlow({ ...flow, failedCodeAttempts }),
            loginFlowCookieOptions()
          );
        } else {
          response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
        }
        return response;
      }
      return json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Kingshot login could not save the verified account.', error);
    return json(
      {
        error: 'Your account was verified, but we could not finish sign-in. Please try again.',
        code: 'SESSION_CREATE_FAILED',
      },
      { status: 500 }
    );
  }
}
