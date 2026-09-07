import { guideSummary } from '../../../lib/guideValidation.mjs';
import { readMemberSession } from '../../../lib/memberAuth';
import { isAdminRequest } from '../../../lib/adminAuth';
import { guidesTable } from '../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request) {
  try {
    const supabase = createAdminSupabaseClient();
    const allowed = Boolean(await readMemberSession(request)) || await isAdminRequest(request);
    let query = supabase
      .from(guidesTable())
      .select('slug, title, category, description, body, access_level, position, updated_at')
      .eq('is_published', true)
      .order('position', { ascending: true })
      .order('title', { ascending: true });
    if (!allowed) query = query.eq('access_level', 'public');
    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ guides: (data || []).map(guideSummary) }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('guides directory GET failed', error);
    return NextResponse.json({ error: 'Unable to load guides.' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
