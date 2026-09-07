import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const db = createAdminSupabaseClient();
    const [website, transfers] = await Promise.all([
      db.from('website_requests').select('id', { count: 'exact', head: true }).or('status.eq.new,status.is.null'),
      db.from('interest_submissions').select('id', { count: 'exact', head: true }).or('status.in.(pending,waitlist),status.is.null'),
    ]);
    if (website.error || transfers.error) throw website.error || transfers.error;
    return NextResponse.json({ website: website.count || 0, transfers: transfers.count || 0 }, { headers });
  } catch { return NextResponse.json({ error: 'Task counts unavailable.' }, { status: 503, headers }); }
}
