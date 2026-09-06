import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCollection } from '../../../../lib/mongo';
import { isLoginSuperadmin, toPublicProfile } from '../../../../lib/kingshotLogin';
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
import { isPersonalCodeRateLimited, recordLoginEvent } from '../../../../lib/kingshotLoginAudit';
import { ensureInitialKingshotOwner } from '../../../../lib/kingshotAccountBootstrap';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request) {
  const flow = readLoginFlow(request);
  if (!flow) {
    return json({ error: 'Your login attempt expired. Enter your Player ID again.' }, { status: 401 });
  }
  if (flow.state !== 'awaiting_personal_code' && flow.state !== 'awaiting_game_confirmation') {
    return json({ error: 'Personal code is not available for this login step.' }, { status: 409 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  const code = String(body?.code || '').trim();
  if (!code || code.length > 64) {
    return json({ error: 'Enter your personal code.' }, { status: 400 });
  }

  try {
    if (await isPersonalCodeRateLimited(request, flow.playerId)) {
      return json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    await ensureInitialKingshotOwner();

    const codes = await getCollection('kingshot_personal_codes');
    const record = await codes.findOne({ player_id: flow.playerId, active: { $ne: false } });
    if (!record?.code_hash) {
      return json({ error: 'No personal code is set for this Player ID.' }, { status: 404 });
    }

    const ok = await bcrypt.compare(code, record.code_hash);
    if (!ok) {
      const failed = (flow.failedPersonalCodeAttempts || 0) + 1;
      await recordLoginEvent(request, 'verification_failed', flow.playerId, {
        attempt: failed,
        method: 'personal_code',
      });
      const retryAllowed = failed < 5;
      const response = json(
        {
          error: retryAllowed ? 'Incorrect personal code.' : 'Too many incorrect codes. Start over.',
          retryAllowed,
        },
        { status: 401 }
      );
      if (retryAllowed) {
        response.cookies.set(
          LOGIN_FLOW_COOKIE_NAME,
          sealLoginFlow({ ...flow, failedPersonalCodeAttempts: failed, state: 'awaiting_personal_code' }),
          loginFlowCookieOptions()
        );
      } else {
        response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
      }
      return response;
    }

    const users = await getCollection('kingshot_users');
    const role = isLoginSuperadmin(flow.playerId) ? 'superadmin' : 'member';
    await users.updateOne(
      { player_id: flow.playerId },
      {
        $set: {
          player_id: flow.playerId,
          kingdom_id: 710,
          access_role: role,
          last_login_at: new Date(),
          updated_at: new Date(),
        },
        $setOnInsert: {
          nickname: `Governor ${flow.playerId}`,
          created_at: new Date(),
        },
      },
      { upsert: true }
    );
    const user = await users.findOne({ player_id: flow.playerId });
    const session = await createMemberSession(flow.playerId, request);
    await recordLoginEvent(request, 'login_success', flow.playerId, {
      role,
      method: 'personal_code',
    });

    const response = json({ ok: true, state: 'authenticated', profile: toPublicProfile(user) });
    response.cookies.set(MEMBER_COOKIE_NAME, session.token, memberSessionCookieOptions());
    response.cookies.set(LOGIN_FLOW_COOKIE_NAME, '', loginFlowCookieOptions(0));
    return response;
  } catch (error) {
    console.error('personal code login failed', error);
    return json({ error: 'Unable to complete personal-code login.' }, { status: 500 });
  }
}
