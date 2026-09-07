import { mergePowerProfilesIntoRows } from '../../../lib/powerProfiles.mjs';
import { getAdminMemberGiftSummaries, mergeGiftCodeStatusIntoRows } from '../../../lib/giftCodes.mjs';
import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;
const SIX_DIGIT_PIN_RE = /^\d{6}$/;

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function pinStatus(pinHash) {
  return BCRYPT_HASH_RE.test(String(pinHash || '')) ? 'secured' : 'needs_reset';
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('submissions')
      .select('name,member_id,pin_hash,updated_at,current_alliance,infantry_tier,infantry_tg,cavalry_tier,cavalry_tg,archer_tier,archer_tg')
      .order('name', { ascending: true });

    if (error) throw error;

    const { data: profiles, error: profileError } = await supabase.from('power_profiles').select('member_id,name,governor_gear,charms,pet_power,masters_power,mystic_trial_score,infantry_tier,infantry_tg,cavalry_tier,cavalry_tg,archer_tier,archer_tg,updated_at');
    if (profileError) throw profileError;
    const merged = mergePowerProfilesIntoRows(data || [], profiles || []);

    let giftSummaries;
    try {
      giftSummaries = await getAdminMemberGiftSummaries();
    } catch (giftError) {
      console.error('admin-member-pins gift code summary failed', giftError);
      giftSummaries = new Map();
    }
    const withGiftCodes = mergeGiftCodeStatusIntoRows(merged, giftSummaries);

    return noStoreJson({
      rows: withGiftCodes.map(({ pin_hash, power_profile, ...row }) => ({
        ...row,
        name: row.name || '',
        member_id: row.member_id || '',
        pin_status: pinStatus(pin_hash),
        updated_at: row.updated_at || null,
      })),
    });
  } catch (error) {
    console.error('admin-member-pins GET failed', error);
    return noStoreJson({ error: 'Unable to load member PIN status.' }, { status: 500 });
  }
}

// Create a new roster member and initial PIN atomically.
export async function PUT(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim();
  const memberId = String(body?.memberId || '').trim();
  const pin = String(body?.pin || '').trim();

  if (!name || name.length > 120) {
    return noStoreJson({ error: 'Enter a valid member name.' }, { status: 400 });
  }
  if (!memberId || memberId.length > 120) {
    return noStoreJson({ error: 'Enter a valid Member ID.' }, { status: 400 });
  }
  if (!SIX_DIGIT_PIN_RE.test(pin)) {
    return noStoreJson({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data: created, error: createError } = await supabase.rpc('admin_create_member_with_pin', {
      p_name: name,
      p_member_id: memberId,
      p_pin: pin,
    });

    if (createError) throw createError;
    if (created !== true) {
      return noStoreJson({ error: 'That Member ID already exists.' }, { status: 409 });
    }

    const { data: row, error: rowError } = await supabase
      .from('submissions')
      .select('name,member_id,updated_at')
      .eq('member_id', memberId)
      .single();

    if (rowError) throw rowError;

    return noStoreJson({
      ok: true,
      row: {
        name: row?.name || name,
        member_id: row?.member_id || memberId,
        pin_status: 'secured',
        updated_at: row?.updated_at || null,
      },
      pin,
      message: 'Member created. The PIN is stored only as a secure hash.',
    });
  } catch (error) {
    console.error('admin-member-pins PUT failed', error);
    return noStoreJson({ error: 'Unable to create member.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const memberId = String(body?.memberId || '').trim();
  if (!memberId || memberId.length > 120) {
    return noStoreJson({ error: 'Invalid Member ID.' }, { status: 400 });
  }

  // Generate on the server so the replacement PIN is unpredictable and never
  // supplied by an unauthenticated client. Leading zeroes are allowed.
  const newPin = String(randomInt(0, 1_000_000)).padStart(6, '0');

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc('admin_reset_member_pin', {
      p_member_id: memberId,
      p_new_pin: newPin,
    });

    if (error) throw error;
    if (data !== true) {
      return noStoreJson({ error: 'Member not found.' }, { status: 404 });
    }

    return noStoreJson({
      ok: true,
      memberId,
      pin: newPin,
      message: 'PIN reset. This replacement PIN is shown only in this response.',
    });
  } catch (error) {
    console.error('admin-member-pins POST failed', error);
    return noStoreJson({ error: 'Unable to reset member PIN.' }, { status: 500 });
  }
}
