import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';

const STATUSES = ['new', 'reviewed'];

export async function PATCH(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await paramsPromise;
  if (!id) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const status = String(body?.status || '');
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  }
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('website_requests')
      .update({ status })
      .eq('id', id)
      .select('id,member_id,name,current_alliance,section,message,status,created_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
