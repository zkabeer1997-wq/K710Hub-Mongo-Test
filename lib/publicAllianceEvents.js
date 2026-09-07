import { createAdminSupabaseClient } from './adminSupabase';
import { allianceEventEntries } from './allianceEvents.mjs';

export async function loadPublicAllianceEvents() {
  const { data, error } = await createAdminSupabaseClient()
    .from('alliances').select('tag, name, scheduled_events')
    .eq('active', true).order('sort_order', { ascending: true });
  if (error) throw error;
  return allianceEventEntries(data || []);
}

export async function loadPublicAllianceEventsOrNull() {
  try { return await loadPublicAllianceEvents(); }
  catch (error) { console.error('Alliance events unavailable', error); return null; }
}
