import { NextResponse } from 'next/server';
import { readKingshotSession } from '../../../lib/memberAuthKingshot';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';

const ROLES = new Set(['member', 'admin', 'superadmin']);

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function requireSuperadmin(request) {
  // The shared admin-password login has no Kingshot player account, but is
  // treated as full admin access everywhere else in /admin/dashboard (see
  // isAdminRequest in lib/adminAuth.js) - honor it here too, with a null
  // playerId so "isSelf" checks in the UI simply never match.
  const legacyToken = request.cookies.get(ADMIN_COOKIE_NAME);
  if (await isValidAdminToken(legacyToken && legacyToken.value)) {
    return { role: 'superadmin', playerId: null };
  }
  const session = await readKingshotSession(request);
  return session?.role === 'superadmin' ? session : null;
}

export async function GET(request) {
  const actor = await requireSuperadmin(request);
  if (!actor) return json({ error: 'Superadmin access required.' }, { status: 403 });

  try {
    const usersColl = await getCollection('kingshot_users');
    const codesColl = await getCollection('kingshot_personal_codes');
    const users = await usersColl.find({}).sort({ nickname: 1 }).toArray();
    const codes = await codesColl.find({ active: { $ne: false } }).toArray();
    const codeByPlayer = new Map(codes.map((c) => [String(c.player_id), c]));

    const mapped = users.map(({ _id, personal_code_hash, ...user }) => {
      const code = codeByPlayer.get(String(user.player_id));
      return {
        ...user,
        personal_code_configured: Boolean(code?.code_hash),
      };
    });
    return json({ users: mapped, actorPlayerId: actor.playerId });
  } catch {
    return json({ error: 'User access could not be loaded.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const actor = await requireSuperadmin(request);
  if (!actor) return json({ error: 'Superadmin access required.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  const targetPlayerId = String(body?.playerId || '').trim();
  const accessRole = String(body?.role || '').trim();
  if (!/^\d{4,20}$/.test(targetPlayerId) || !ROLES.has(accessRole)) {
    return json({ error: 'Choose a valid user and role.' }, { status: 400 });
  }
  if (targetPlayerId === actor.playerId && accessRole !== 'superadmin') {
    return json({ error: 'You cannot remove your own superadmin access.' }, { status: 400 });
  }

  try {
    const coll = await getCollection('kingshot_users');
    const result = await coll.findOneAndUpdate(
      { player_id: targetPlayerId },
      { $set: { access_role: accessRole, updated_at: new Date() } },
      { returnDocument: 'after' }
    );
    const user = result?.value || result;
    if (!user) return json({ error: 'That user no longer exists.' }, { status: 404 });
    const { _id, ...safe } = user;
    return json({ ok: true, user: safe });
  } catch {
    return json({ error: 'The role could not be updated.' }, { status: 500 });
  }
}
