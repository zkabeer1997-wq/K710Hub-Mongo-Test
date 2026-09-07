import { createAdminSupabaseClient } from './adminSupabase';

export async function getGalleryImages({ publishedOnly = true, limit } = {}) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from('gallery_images')
    .select('id, image_url, storage_path, title, caption, alt_text, position, is_published, created_at, updated_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (publishedOnly) query = query.eq('is_published', true);
  if (Number.isInteger(limit) && limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

