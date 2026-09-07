import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { publicFlamedragonRecord, sanitizeFlamedragonInput } from '../../../lib/flamedragonForm.mjs';

const PUBLIC_COLUMNS = 'member_id,name,current_alliance,infantry_tier,infantry_tg,cavalry_tier,cavalry_tg,archer_tier,archer_tg,heroes,charms,governor_gear,pet_power,masters_power,mystic_trial_score,availability,voice_chat,auto_help,updated_at';

function pinHash(pin) {
  return createHash('sha256').update('kvk-flamedragon-v1:' + pin).digest('hex');
}

function tableMissingResponse() {
  return NextResponse.json({
    error: 'Flamedragon forms are not configured yet. Apply the flamedragon_forms database migration first.',
  }, { status: 500 });
}

function isMissingTableError(error) {
  return error && (
    error.code === '42P01' || String(error.message || '').toLowerCase().includes('flamedragon_forms')
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const memberId = String(url.searchParams.get('member_id') || '').trim();
  if (!memberId) {
    return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
  }
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('flamedragon_forms')
      .select(PUBLIC_COLUMNS)
      .eq('member_id', memberId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return tableMissingResponse();
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ record: publicFlamedragonRecord(data) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  let record;
  try {
    const body = await request.json();
    record = sanitizeFlamedragonInput(body);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  try {
    const supabase = createAdminSupabaseClient();
    const { data: existing, error: selectError } = await supabase
      .from('flamedragon_forms')
      .select('member_id,pin_hash')
      .eq('member_id', record.member_id)
      .maybeSingle();
    if (selectError) {
      if (isMissingTableError(selectError)) return tableMissingResponse();
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }
    const nextHash = pinHash(record.pin);
    if (existing && existing.pin_hash !== nextHash) {
      return NextResponse.json({ error: 'Incorrect PIN for this Member ID. Please try again.' }, { status: 403 });
    }
    const payload = {
      member_id: record.member_id,
      name: record.name,
      current_alliance: record.current_alliance || null,
      infantry_tier: record.infantry_tier || null,
      infantry_tg: record.infantry_tg || null,
      cavalry_tier: record.cavalry_tier || null,
      cavalry_tg: record.cavalry_tg || null,
      archer_tier: record.archer_tier || null,
      archer_tg: record.archer_tg || null,
      heroes: record.heroes,
      charms: record.charms || null,
      governor_gear: record.governor_gear || null,
      pet_power: record.pet_power || null,
      masters_power: record.masters_power || null,
      mystic_trial_score: record.mystic_trial_score || null,
      availability: record.availability || null,
      voice_chat: record.voice_chat || null,
      auto_help: record.auto_help || null,
      pin_hash: nextHash,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('flamedragon_forms')
      .upsert(payload, { onConflict: 'member_id' })
      .select(PUBLIC_COLUMNS)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return tableMissingResponse();
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      status: existing ? 'updated' : 'created',
      record: publicFlamedragonRecord(data),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
