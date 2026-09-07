import { createAdminSupabaseClient } from './adminSupabase';

// Return only public alliance information. Never expose admin/roster fields.
export async function loadPublicBearSchedule() {
  const { data, error } = await createAdminSupabaseClient()
    .from('alliances').select('tag, name, bear_times_utc, updated_at')
    .eq('active', true).order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadPublicBearScheduleOrNull() {
  try { return await loadPublicBearSchedule(); }
  catch (error) { console.error('Public Bear Hunt schedule unavailable', error); return null; }
}

// Remove only the site's old stock schedule descriptions, preserving
// leadership notes and other admin-written text after those paragraphs.
export function stripLegacyBearCopy(text = '') {
  const stock = [
    'Two Bear Hunts each day.', 'Three Bear Hunts each day.',
    'Two hunts a day, anchoring the early and midday windows.',
    'Three hunts, running from EU evening through NA late night.',
    'Two hunts anchoring the SEA / AU daytime window.',
  ];
  for (const sentence of stock) text = text.replace(sentence, '');
  return text.trim();
}

export function bearAllianceNotes(content) {
  return Object.fromEntries(['710', 'RED', 'SKY'].map((tag, index) => [tag, stripLegacyBearCopy(content[`wb-${index + 1}-desc`]?.text || '')]));
}
