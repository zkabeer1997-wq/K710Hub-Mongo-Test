import { readingMinutes } from './guideContent.mjs';
import { layoutToMarkdown, validateLayout } from './guideLayout.mjs';
import { SITE_IMAGE_ID_RE } from './siteImageId.mjs';
export const GUIDE_FIELDS = 'slug, title, layout, category, description, body, f2p_content, spender_content, position, is_published, access_level, reviewed_by, image_id, created_at, updated_at';
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
    // Optional: who last reviewed the guide for accuracy. Hidden publicly when empty.
    reviewed_by: typeof payload?.reviewed_by === 'string' ? payload.reviewed_by.trim().replace(/\s+/g, ' ') : '',
  };
  // Optional card picture (site_images id, folder 'guide'). Only set when the payload carries the key, so
  // an older client that never sends it cannot wipe an existing picture ('' clears it on purpose).
  if (payload && Object.hasOwn(payload, 'image_id')) {
    const imageId = typeof payload.image_id === 'string' ? payload.image_id.trim() : '';
    if (imageId && !SITE_IMAGE_ID_RE.test(imageId)) return { error: 'Choose the guide picture again.' };
    guide.image_id = imageId;
  }
  if (!['public', 'members'].includes(guide.access_level)) return { error: 'Choose Public Access or Member Access.' };
  if (!SLUG_RE.test(guide.slug)) return { error: 'Slug must be 1–80 lowercase letters, numbers, or hyphens.' };
  if (!guide.title || guide.title.length > 180) return { error: 'Title is required and must be 180 characters or fewer.' };
  if (!guide.category || guide.category.length > 80) return { error: 'Category is required and must be 80 characters or fewer.' };
  if (guide.reviewed_by.length > 80) return { error: 'Reviewed by must be 80 characters or fewer.' };
  if (guide.description.length > 500) return { error: 'Description must be 500 characters or fewer.' };
  const hasLayout = payload?.layout !== undefined && payload?.layout !== null;
  if ((!hasLayout && typeof payload?.body !== 'string') || guide.body.length > 120000) return { error: 'Guide text must be 120,000 characters or fewer.' };
  if (guide.f2p_content.length > 120000) return { error: 'F2P content must be 120,000 characters or fewer.' };
  if (guide.spender_content.length > 120000) return { error: 'Spender content must be 120,000 characters or fewer.' };
  if (hasLayout) {
    // Block layouts: validate strictly, then keep the legacy `body` in sync so
    // search, descriptions and reading time keep working.
    const { layout, error } = validateLayout(payload.layout, { requireAlt: guide.is_published });
    if (error) return { error };
    guide.layout = layout;
    guide.body = layoutToMarkdown(layout);
    if (guide.body.length > 120000) return { error: 'Guide text must be 120,000 characters or fewer.' };
  }
  if (!Number.isInteger(guide.position) || guide.position < 0 || guide.position > 100000) return { error: 'Position must be a whole number between 0 and 100000.' };
  return { guide };
}

export function guideCategories(guides, categories = []) {
  return [...new Set([...categories.map(c => typeof c === 'string' ? c : c.name), ...guides.map(g => g.category)].map(c => String(c || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function guideSummary({body, f2p_content, spender_content, layout: _layout, draft: _draft, ...guide}) {
  return {...guide,reading_minutes:readingMinutes({body,f2p_content,spender_content})};
}

const str = (value, max) => (typeof value === 'string' ? value : '').slice(0, max);

// Autosaved builder drafts: lenient about metadata (the editor may be mid-edit)
// but the layout still goes through the strict validator. Never touches live fields.
export function validateDraft(payload) {
  const { layout, error } = validateLayout(payload?.layout);
  if (error) return { error };
  return {
    draft: {
      layout,
      slug: str(payload?.slug, 80).trim(),
      title: str(payload?.title, 180),
      category: str(payload?.category, 80),
      description: str(payload?.description, 500),
      access_level: payload?.access_level === 'members' ? 'members' : 'public',
      reviewed_by: str(payload?.reviewed_by, 80),
      position: Number.isInteger(Number(payload?.position)) ? Math.max(0, Math.min(100000, Number(payload.position))) : 0,
      f2p_content: str(payload?.f2p_content, 120000),
      spender_content: str(payload?.spender_content, 120000),
      image_id: typeof payload?.image_id === 'string' && SITE_IMAGE_ID_RE.test(payload.image_id.trim()) ? payload.image_id.trim() : '',
    },
  };
}
