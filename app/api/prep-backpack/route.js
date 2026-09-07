import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

export async function POST(request) {
  try {
    const data = await request.json();
    const supabase = createAdminSupabaseClient();

    const str = (v) => String(v == null ? '' : v);
    const arr = (v) => (Array.isArray(v) ? v.map(String) : []);

    const payload = {
      member_id: str(data.member_id),
      in_game_name: str(data.in_game_name),
      want_construction: str(data.want_construction),
      construction_upgrades: arr(data.construction_upgrades),
      ttg_used: str(data.ttg_used),
      tg_used: str(data.tg_used),
      want_research: str(data.want_research),
      t11_troops: arr(data.t11_troops),
      tg_dust: str(data.tg_dust),
      research_speedup_days: str(data.research_speedup_days),
      want_troop_training: str(data.want_troop_training),
      is_transfer: str(data.is_transfer),
      troop_speedup_days: str(data.troop_speedup_days),
      promoting_t11: str(data.promoting_t11),
      avail_day1: arr(data.avail_day1),
      avail_day2: arr(data.avail_day2),
      avail_day4: arr(data.avail_day4),
      avail_day5: arr(data.avail_day5),
      notes: str(data.notes),
      updated_at: new Date().toISOString(),
    };

    if (!payload.member_id || !payload.in_game_name) {
      return NextResponse.json({ error: 'Missing Member ID or in-game name.' }, { status: 400 });
    }

    const { error } = await supabase.from('prep_backpack_submissions').upsert(payload, { onConflict: 'member_id' });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
