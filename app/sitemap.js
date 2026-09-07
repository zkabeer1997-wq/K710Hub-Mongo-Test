import { guidesTable } from '../lib/guideAccess.mjs';
import { createAdminSupabaseClient } from '../lib/adminSupabase';

const BASE_URL = 'https://k710hub.vercel.app';

const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/timeline', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/guides', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/events', priority: 0.8, changeFrequency: 'daily' },
  { path: '/gallery', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/interest', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/player-record', priority: 0.5, changeFrequency: 'yearly' },
];

async function guideEntries() {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from(guidesTable())
      .select('slug, updated_at')
      .eq('is_published', true).eq('access_level', 'public');
    if (error) throw error;
    return (data || []).map((g) => ({
      url: `${BASE_URL}/guides/${g.slug}`,
      lastModified: g.updated_at ? new Date(g.updated_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

async function allianceEntries() {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('alliances')
      .select('tag, updated_at')
      .eq('active', true);
    if (error) throw error;
    return (data || []).map((a) => ({
      url: `${BASE_URL}/alliances/${a.tag.toLowerCase()}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const [guides, alliances] = await Promise.all([guideEntries(), allianceEntries()]);

  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  return [...staticEntries, ...guides, ...alliances];
}
