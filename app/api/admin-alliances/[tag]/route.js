import { validateAllianceEvents } from '../../../../lib/allianceEvents.mjs';
import { NextResponse } from 'next/server';
import { revalidateAlliancePages } from '../../../../lib/revalidateAlliancePages';
import { validateBearTimes } from '../../../../lib/bearHuntSchedule';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';

const STATUSES = ['open', 'selective', 'closed'];

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function PUT(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const params = await paramsPromise;
  const tag = params?.tag;
  if (!tag) return NextResponse.json({ error: 'Missing alliance tag.' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const update = {};
  if (body.scheduled_events !== undefined) {
    const { events, error: eventError } = validateAllianceEvents(body.scheduled_events);
    if (eventError) return NextResponse.json({ error: eventError }, { status: 400 });
    update.scheduled_events = events;
  }
  if (body.bear_times_utc !== undefined) {
    const { times, error: timeError } = validateBearTimes(body.bear_times_utc);
    if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });
    update.bear_times_utc = times;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    update.name = name;
  }
  if (body.blurb !== undefined) update.blurb = String(body.blurb);
  if (body.leader_player_id !== undefined) update.leader_player_id = body.leader_player_id ? String(body.leader_player_id) : null;
  if (body.timezone_focus !== undefined) update.timezone_focus = body.timezone_focus ? String(body.timezone_focus) : null;
  if (body.language !== undefined) update.language = body.language ? String(body.language) : null;
  if (body.roster_size !== undefined) {
    update.roster_size = body.roster_size !== '' && Number.isFinite(Number(body.roster_size)) ? Number(body.roster_size) : null;
  }
  if (body.active !== undefined) update.active = Boolean(body.active);
  if (body.sort_order !== undefined) update.sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  if (body.recruiting_status !== undefined) {
    if (!STATUSES.includes(body.recruiting_status)) {
      return NextResponse.json({ error: 'Unsupported recruiting status.' }, { status: 400 });
    }
    update.recruiting_status = body.recruiting_status;
  }
  update.updated_at = new Date().toISOString();

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('alliances')
    .update(update)
    .eq('tag', tag)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateAlliancePages(tag);

  return NextResponse.json({ alliance: data });
}

export async function DELETE(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const params = await paramsPromise;
  const tag = params?.tag;
  if (!tag) return NextResponse.json({ error: 'Missing alliance tag.' }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from('alliances').delete().eq('tag', tag);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateAlliancePages(tag);

  return NextResponse.json({ ok: true });
}
