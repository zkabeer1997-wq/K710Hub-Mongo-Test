import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { page, type, content, position } = body;
    if (!page || !type) {
      return NextResponse.json({ error: 'Missing page or type' }, { status: 400 });
    }
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
    .from('content_blocks')
    .insert({ page, type, content: content || {}, position: position || 0 })
    .select()
    .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ block: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
