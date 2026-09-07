import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { readMemberSession } from '../../../lib/memberAuth';

const COLUMNS = 'name,member_id,current_alliance,availability,updated_at';
const ALLIANCES = ['710', 'RED', 'SKY'];
const AVAILABILITY = ['First half (12-14:30 UTC)', 'Second half (14:30-17 UTC)', 'Full battle (12-17 UTC)', 'Not Available'];

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const { data, error } = await createAdminSupabaseClient().from('submissions')
      .select(COLUMNS).eq('member_id', session.memberId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ row: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load your saved availability. Please try again.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const name = String(body?.name || '').trim();
  const memberId = String(body?.member_id || '').trim();
  const alliance = String(body?.current_alliance || '').trim();
  const availability = String(body?.availability || '').trim();
  const pin = String(body?.pin || '');
  if (memberId !== session.memberId) {
    return NextResponse.json({ error: 'Sign in with this Player ID to update its availability.' }, { status: 403 });
  }
  if (!name || name.length > 120 || !pin || pin.length > 120 || !ALLIANCES.includes(alliance) || !AVAILABILITY.includes(availability)) {
    return NextResponse.json({ error: 'Enter your name and PIN, and select your alliance and availability.' }, { status: 400 });
  }
  try {
    const { data, error } = await createAdminSupabaseClient().rpc('save_kvk_availability', {
      p_member_id: memberId, p_name: name, p_current_alliance: alliance,
      p_availability: availability, p_pin: pin,
    });
    if (error) {
      if (error.message?.includes('PIN_MISMATCH')) {
        return NextResponse.json({ error: 'Incorrect PIN for this Member ID. Please try again.' }, { status: 403 });
      }
      throw error;
    }
    return NextResponse.json({ row: data });
  } catch {
    return NextResponse.json({ error: 'Could not save your alliance and availability. Please try again.' }, { status: 500 });
  }
}
