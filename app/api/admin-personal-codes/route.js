import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { readKingshotSession } from '../../../lib/memberAuthKingshot';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function requireSuperadmin(request) {
  // See app/api/admin-user-roles/route.js: the shared admin-password login
  // has no Kingshot player account but is treated as full admin access
  // everywhere else in /admin/dashboard, so it must satisfy this gate too.
  const legacyToken = request.cookies.get(ADMIN_COOKIE_NAME);
  if (await isValidAdminToken(legacyToken && legacyToken.value)) {
    return { role: 'superadmin', playerId: null };
  }
  const session = await readKingshotSession(request);
  return session?.role === 'superadmin' ? session : null;
}

export async function POST(request) {
  const actor = await requireSuperadmin(request);
  if (!actor) {
    return json({ error: 'Superadmin access required.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400 });
  }

  const targetPlayerId = String(body?.playerId || '').trim();
  if (!/^\d{4,20}$/.test(targetPlayerId)) {
    return json({ error: 'Choose a valid user.' }, { status: 400 });
  }

  try {
    const users = await getCollection('kingshot_users');
    const user = await users.findOne({ player_id: targetPlayerId });
    if (!user) return json({ error: 'That user no longer exists.' }, { status: 404 });

    const personalCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const code_hash = await bcrypt.hash(personalCode, 10);
    const codes = await getCollection('kingshot_personal_codes');
    await codes.updateOne(
      { player_id: targetPlayerId },
      {
        $set: {
          player_id: targetPlayerId,
          code_hash,
          active: true,
          updated_at: new Date(),
          reset_by: actor.playerId,
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );

    return json({
      ok: true,
      playerId: targetPlayerId,
      personalCode,
      message: 'Personal code reset. This code is shown only in this response.',
    });
  } catch {
    return json({ error: 'The personal code could not be reset.' }, { status: 500 });
  }
}
