import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../lib/supabaseAdmin';
import { createMemberToken, MEMBER_COOKIE_NAME, MEMBER_TOKEN_TTL_MS } from '../../../lib/memberAuth';
import { enrollMemberForGiftCodes } from '../../../lib/giftCodes.mjs';

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
    const supabase = createSupabaseAdminClient();

    // Never overwrite or claim an existing Member ID through the public
    // first-time flow. Existing members must authenticate with their PIN or
    // have an admin reset it.
    const { data: existing, error: lookupError } = await supabase
      .from('submissions')
      .select('member_id')
      .eq('member_id', memberId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) {
      return noStoreJson({
        error: 'This Member ID already exists. Sign in with your PIN or ask an admin to reset it.',
      }, { status: 409 });
    }

    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { data: created, error: createError } = await supabase.rpc('admin_create_member_with_pin', {
      p_name: name,
      p_member_id: memberId,
      p_pin: pin,
    });

    if (createError) throw createError;
    if (created !== true) {
      return noStoreJson({
        error: 'This Member ID was just registered. Sign in instead.',
      }, { status: 409 });
    }

    // Enroll for automatic gift-code redemption (Kingdom 710). Non-blocking:
    // registration succeeds even if enrollment fails.
    let giftCodeNotice = null;
    try {
      await enrollMemberForGiftCodes(memberId, memberId, 710);
      giftCodeNotice =
        'We will automatically redeem available gift codes for your Kingdom 710 account.';
    } catch (enrollErr) {
      console.error('gift-code enrollment failed (registration still ok)', enrollErr);
    }

    const token = await createMemberToken(memberId);
    const response = noStoreJson({
      ok: true,
      created: true,
      memberId,
      pin,
      message: 'Your PIN is shown only once. Save it before continuing.',
      giftCodeNotice,
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
