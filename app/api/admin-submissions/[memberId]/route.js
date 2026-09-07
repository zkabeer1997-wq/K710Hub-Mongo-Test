import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';

export async function DELETE(request, { params: paramsPromise }) {
if (!(await isAdminRequest(request))) {
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
const params = await paramsPromise;
const memberId = params.memberId;
if (!memberId) {
return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
}
try {
const supabase = createAdminSupabaseClient();
const { data, error } = await supabase
.from('submissions')
.delete()
.eq('member_id', memberId)
.select('member_id');
if (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
if (!data || data.length === 0) {
return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
}
await supabase
.from('power_profiles')
.delete()
.eq('member_id', memberId);
return NextResponse.json({ deletedMemberIds: [String(memberId)] });
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
}
