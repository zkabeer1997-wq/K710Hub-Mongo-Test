import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

const COLUMNS = 'id,member_id,name,current_alliance,section,message,status,created_at';

function isMissingTableError(error) {
  return error && (
    error.code === '42P01' || String(error.message || '').toLowerCase().includes('website_requests')
  );
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('website_requests')
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ rows: [], configured: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: data || [], configured: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
