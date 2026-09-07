import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { readMemberSession } from '../../../lib/memberAuth';
import { SUPPORTED_TOOL_KEYS } from '../../../lib/toolKeys.mjs';

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
  try {
    const { data, error } = await createAdminSupabaseClient()
      .from('member_tool_state').select('tool_key, updated_at')
      .eq('member_id', session.memberId).in('tool_key', SUPPORTED_TOOL_KEYS)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ plans: data || [] });
  } catch (error) {
    console.error('tool-state list GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved plans.' }, { status: 500 });
  }
}
