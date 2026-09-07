import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const order = Array.isArray(body.order) ? body.order : [];
    const supabase = createAdminSupabaseClient();
    if (order.length > 0) {
      const { error } = await supabase
        .from('content_blocks')
        .upsert(order.map((id, position) => ({ id, position })), { onConflict: 'id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
