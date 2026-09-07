import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

const VALID_STATUSES = ['special', 'normal', 'reject', 'waitlist', 'pending'];
const ACCEPT_STATUSES = ['special', 'normal'];

function profilePinHash(pin) {
  return createHash('sha256').update('kvk-power-profile-v1:' + pin).digest('hex');
}

function defaultPasswordFor(playerId) {
  return '710-' + String(playerId || '').trim();
}

function isMissingTable(error) {
  return error && error.code === '42P01';
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Submission id is required.' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unsupported status.' }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();

    const { data: submission, error: fetchError } = await supabase
      .from('interest_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    }

    let accountResult = null;

    if (ACCEPT_STATUSES.includes(status)) {
      const memberId = String(submission.player_id || '').trim();
      const name = String(submission.in_game_name || '').trim();
      if (!memberId || !name) {
        return NextResponse.json({ error: 'Applicant is missing a Player ID or in-game name, so an account cannot be created.' }, { status: 400 });
      }
      const password = defaultPasswordFor(memberId);

      const { data: existingRecord, error: recordLookupError } = await supabase
        .from('submissions')
        .select('member_id')
        .eq('member_id', memberId)
        .maybeSingle();
      if (recordLookupError && !isMissingTable(recordLookupError)) {
        return NextResponse.json({ error: recordLookupError.message }, { status: 500 });
      }

      let recordCreated = false;
      if (!existingRecord) {
        const { error: rpcError } = await supabase.rpc('submit_troop_form', {
          p_name: name,
          p_member_id: memberId,
          p_infantry_tier: null,
          p_infantry_tg: null,
          p_cavalry_tier: null,
          p_cavalry_tg: null,
          p_archer_tier: null,
          p_archer_tg: null,
          p_heroes: [],
          p_availability: null,
          p_pin: password,
        });
        if (rpcError) {
          return NextResponse.json({ error: 'Failed to create player record: ' + rpcError.message }, { status: 500 });
        }
        recordCreated = true;
      }

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('power_profiles')
        .select('member_id')
        .eq('member_id', memberId)
        .maybeSingle();
      if (profileLookupError && !isMissingTable(profileLookupError)) {
        return NextResponse.json({ error: profileLookupError.message }, { status: 500 });
      }

      let profileCreated = false;
      if (!existingProfile) {
        const { error: profileInsertError } = await supabase
          .from('power_profiles')
          .insert({
            member_id: memberId,
            name,
            pin_hash: profilePinHash(password),
            updated_at: new Date().toISOString(),
          });
        if (profileInsertError && !isMissingTable(profileInsertError)) {
          return NextResponse.json({ error: 'Failed to create player profile: ' + profileInsertError.message }, { status: 500 });
        }
        profileCreated = !profileInsertError;
      }

      accountResult = {
        member_id: memberId,
        name,
        password,
        recordCreated,
        recordExisted: !!existingRecord,
        profileCreated,
        profileExisted: !!existingProfile,
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('interest_submissions')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ row: updated, account: accountResult });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
