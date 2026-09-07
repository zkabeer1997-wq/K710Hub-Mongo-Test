import { cookies } from 'next/headers';
import { createAdminSupabaseClient } from './adminSupabase';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from './adminAuth';

export async function getBlocks(page) {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
    .from('content_blocks')
    .select('*')
    .eq('page', page)
    .order('position', { ascending: true });
    if (error) return [];
    return data || [];
  } catch (error) {
    return [];
  }
}

export async function checkIsAdmin() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(ADMIN_COOKIE_NAME);
    return isValidAdminToken(cookie && cookie.value);
  } catch (error) {
    return false;
  }
}
