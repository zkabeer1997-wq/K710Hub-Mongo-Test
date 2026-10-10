import { NextResponse } from 'next/server';
import { readKingshotSession } from '../../../lib/memberAuthKingshot';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from '../../../lib/adminAuth';
import { invalidateMemberSessionCache } from '../../../lib/memberAuth';
import { getCollection } from '../../../lib/mongo';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function requireSuperadmin(request) {
  const legacyToken = request.cookies.get(ADMIN_COOKIE_NAME);
  if (await isValidAdminToken(legacyToken && legacyToken.value)) return { role: 'superadmin', playerId: null };
  const session = await readKingshotSession(request);
  return session?.role === 'superadmin' ? session : null;
}

// Superadmin only. "remove" ends every open sign-in for the account, blocks new sign-ins,
// drops the role to member and turns the personal code off. "restore" lets them sign in again.
export async function POST(request) {
  const actor = await requireSuperadmin(request);
  if (!actor) return json({ error: 'Superadmin access required.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }
  const playerId = String(body?.playerId || '').trim();
  const action = String(body?.action || '').trim();
  const reason = String(body?.reason || '').trim().slice(0, 200);
  if (!/^\d{4,20}$/.test(playerId) || !['remove', 'restore'].includes(action)) {
    return json({ error: 'Choose a valid user.' }, { status: 400 });
  }
  if (action === 'remove' && playerId === actor.playerId) {
    return json({ error: 'You cannot remove your own access.' }, { status: 400 });
  }

  try {
    const users = await getCollection('kingshot_users');
    const user = await users.findOne({ player_id: playerId });
    if (!user) return json({ error: 'That user no longer exists.' }, { status: 404 });

    if (action === 'restore') {
      await users.updateOne(
        { player_id: playerId },
        { $unset: { access_removed_at: '', access_removed_by: '', access_removed_reason: '' }, $set: { updated_at: new Date() } }
      );
      return json({ ok: true, playerId, removed: false });
    }

    if (user.access_role === 'superadmin') {
      return json({ error: 'Change this superadmin to Member or Admin first, then remove access.' }, { status: 400 });
    }
    const now = new Date();
    await users.updateOne(
      { player_id: playerId },
      {
        $set: {
          access_role: 'member',
          access_removed_at: now,
          access_removed_by: actor.playerId || 'admin-password',
          access_removed_reason: reason,
          updated_at: now,
        },
      }
    );
    const sessions = await getCollection('kingshot_sessions');
    await sessions.updateMany({ player_id: playerId, revoked_at: null }, { $set: { revoked_at: now } });
    const codes = await getCollection('kingshot_personal_codes');
    await codes.updateMany({ player_id: playerId }, { $set: { active: false } });
    invalidateMemberSessionCache();
    return json({ ok: true, playerId, removed: true, removedAt: now.toISOString() });
  } catch {
    return json({ error: 'Access could not be changed.' }, { status: 500 });
  }
}
