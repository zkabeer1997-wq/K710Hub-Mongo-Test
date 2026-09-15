export const GUIDE_FIELDS = 'slug, title, category, description, body, f2p_content, spender_content, position, is_published, access_level, created_at, updated_at';
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export function validateGuide(payload) {
  const guide = {
    slug: typeof payload?.slug === 'string' ? payload.slug.trim() : '',
    title: typeof payload?.title === 'string' ? payload.title.trim() : '',
    category: typeof payload?.category === 'string' ? payload.category.trim() : '',
    description: typeof payload?.description === 'string' ? payload.description.trim() : '',
    body: typeof payload?.body === 'string' ? payload.body : '',
    // Shared/default content lives in `body`. These two are optional
    // tab-specific overrides — a guide with neither set shows no tab bar
    // and just renders `body` (see the public guide page).
    f2p_content: typeof payload?.f2p_content === 'string' ? payload.f2p_content : '',
    spender_content: typeof payload?.spender_content === 'string' ? payload.spender_content : '',
    position: Number(payload?.position),
    is_published: payload?.is_published === true,
    access_level: payload?.access_level ?? 'public',
  };
  if (!['public', 'members'].includes(guide.access_level)) return { error: 'Choose Public Access or Member Access.' };
  if (!SLUG_RE.test(guide.slug)) return { error: 'Slug must be 1–80 lowercase letters, numbers, or hyphens.' };
  if (!guide.title || guide.title.length > 180) return { error: 'Title is required and must be 180 characters or fewer.' };
  if (!guide.category || guide.category.length > 80) return { error: 'Category is required and must be 80 characters or fewer.' };
  if (guide.description.length > 500) return { error: 'Description must be 500 characters or fewer.' };
  if (typeof payload?.body !== 'string' || guide.body.length > 120000) return { error: 'Guide text must be 120,000 characters or fewer.' };
  if (guide.f2p_content.length > 120000) return { error: 'F2P content must be 120,000 characters or fewer.' };
  if (guide.spender_content.length > 120000) return { error: 'Spender content must be 120,000 characters or fewer.' };
  if (!Number.isInteger(guide.position) || guide.position < 0 || guide.position > 100000) return { error: 'Position must be a whole number between 0 and 100000.' };
  return { guide };
}

export function guideCategories(guides, categories = []) {
  return [...new Set([...categories.map(c => typeof c === 'string' ? c : c.name), ...guides.map(g => g.category)].map(c => String(c || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function guideSummary({body, ...guide}) {
  const words=String(body || '').trim().split(/\s+/).filter(Boolean).length;
  return {...guide,reading_minutes:Math.max(1,Math.round(words/200))};
}
