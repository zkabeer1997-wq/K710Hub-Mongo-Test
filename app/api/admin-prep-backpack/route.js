import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('prep_backpack_submissions')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id, key, value } = body || {};
    const EDITABLE = [
      'member_id', 'in_game_name', 'want_construction', 'construction_upgrades',
      'ttg_used', 'tg_used', 'want_research', 't11_troops', 'tg_dust',
      'research_speedup_days', 'want_troop_training', 'is_transfer',
      'troop_speedup_days', 'promoting_t11', 'avail_day1', 'avail_day2',
      'avail_day4', 'avail_day5', 'notes',
    ];
    if (!id || !key || !EDITABLE.includes(key)) {
      return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
    }
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from('prep_backpack_submissions')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
