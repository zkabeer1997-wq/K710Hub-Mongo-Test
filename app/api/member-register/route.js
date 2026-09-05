import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { createMemberToken, MEMBER_COOKIE_NAME, MEMBER_TOKEN_TTL_MS } from '../../../lib/memberAuth';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim();
  const memberId = String(body?.memberId || '').trim();

  if (!name || name.length > 120) {
    return noStoreJson({ error: 'Please enter your governor name.' }, { status: 400 });
  }
  if (!memberId || memberId.length > 120) {
    return noStoreJson({ error: 'Please enter a valid Member ID.' }, { status: 400 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
    const existing = await coll.findOne({ member_id: memberId }, { projection: { member_id: 1 } });
    if (existing) {
      return noStoreJson(
        {
          error:
            'This Member ID already exists. Sign in with your PIN or ask an admin to reset it.',
        },
        { status: 409 }
      );
    }

    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pin_hash = await bcrypt.hash(pin, 10);
    const now = new Date();
    await coll.insertOne({
      name,
      member_id: memberId,
      pin_hash,
      heroes: [],
      created_at: now,
      updated_at: now,
      event_updated_at: now,
    });

    const token = await createMemberToken(memberId);
    const response = noStoreJson({
      ok: true,
      created: true,
      memberId,
      pin,
      message: 'Your PIN is shown only once. Save it before continuing.',
      giftCodeNotice: null,
    });

    response.cookies.set(MEMBER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MEMBER_TOKEN_TTL_MS / 1000,
    });
    return response;
  } catch (error) {
    console.error('member-register failed', error);
    return noStoreJson({ error: 'Unable to create member credentials.' }, { status: 500 });
  }
}
