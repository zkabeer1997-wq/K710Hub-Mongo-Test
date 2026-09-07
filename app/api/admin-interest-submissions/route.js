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
.from('interest_submissions')
.select('*')
.order('created_at', { ascending: false });
if (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
return NextResponse.json({ rows: data || [] });
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
}
