// "710 Lore": short comedic stories, one doc per story in `lore_stories`. English only, plain text only.
// Pure and injectable (no Next/Mongo imports) so it is unit tested; wiring is in app/api/admin-lore and app/lore.
import { SITE_IMAGE_ID_RE } from './siteImageId.mjs';
import { NO_PLACEHOLDER_QUERY, siteImageUrl } from './siteImages.mjs';

export const LORE_IMAGE_FOLDER = 'lore';
export const LORE_NUMBER_MIN = 1;
export const LORE_NUMBER_MAX = 9999;
export const LORE_TITLE_MAX = 120;
export const LORE_BODY_MAX = 8000;
export const LORE_ALT_MAX = 240;
/** Photos are resized in the browser to this long side (aspect kept) and must then fit this cap. */
export const LORE_IMAGE_MAX_SIDE = 1400;
export const LORE_IMAGE_MIN_SIDE = 320;
export const LORE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function loreSlug(number) { return `story-${number}`; }

/** `story-12` -> 12, anything else -> null. */
export function parseLoreSlug(slug) {
  const m = /^story-([1-9]\d{0,3})$/.exec(String(slug ?? ''));
  return m ? Number(m[1]) : null;
}

/** Same-origin photo URL, or '' without a (valid) photo. Failures return an error status, not the SVG placeholder. */
export function loreImageUrl(imageId) {
  return typeof imageId === 'string' && SITE_IMAGE_ID_RE.test(imageId) ? `${siteImageUrl(imageId)}?${NO_PLACEHOLDER_QUERY}` : '';
}

/**
 * Plain text only: no HTML survives as markup (it is always rendered as text). Line endings are normalised,
 * trailing spaces are dropped, runs of blank lines become one blank line, and single line breaks are kept
 * (dialogue lines stay on their own line).
 */
export function normalizeLoreBody(input) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Blank line = new paragraph; inside a paragraph the single line breaks stay (render with white-space: pre-line). */
export function splitLoreParagraphs(body) {
  return normalizeLoreBody(body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/** The first sentence of the story, for meta descriptions. Never longer than `max`. */
export function loreFirstSentence(body, max = 160) {
  const flat = normalizeLoreBody(body).replace(/\s+/g, ' ');
  if (!flat) return '';
  const m = /^.*?[.!?…](?=\s|$)/.exec(flat);
  return clip(m ? m[0] : flat, max);
}

/** A short teaser (about `max` characters, cut at a word). */
export function loreExcerpt(body, max = 150) {
  return clip(normalizeLoreBody(body).replace(/\s+/g, ' '), max);
}

/** Oldest first: story 1 at the top. */
export function sortStories(stories) {
  return [...(stories || [])].sort((a, b) => Number(a.number) - Number(b.number));
}

/** Next free number to suggest in the admin form (highest + 1, 1 when empty). */
export function nextStoryNumber(stories) {
  const numbers = (stories || []).map((s) => Number(s.number)).filter((n) => Number.isInteger(n) && n >= LORE_NUMBER_MIN);
  return Math.min(LORE_NUMBER_MAX, (numbers.length ? Math.max(...numbers) : 0) + 1);
}

/** Previous / next story around `number` in a list of stories (already filtered to what the visitor may see). */
export function loreNeighbours(stories, number) {
  const sorted = sortStories(stories);
  const i = sorted.findIndex((s) => Number(s.number) === Number(number));
  if (i < 0) return { prev: null, next: null };
  return { prev: sorted[i - 1] || null, next: sorted[i + 1] || null };
}

/** Browser resize geometry: keep the aspect, long side at most `maxSide`, never enlarge. */
export function fitWithin(width, height, maxSide = LORE_IMAGE_MAX_SIDE) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Validates an admin request body (POST/PUT).
 * `{ value }` holds the cleaned story fields (number, title, body, published and, when the request sent them,
 * image_id/image_alt); `{ error }` is a plain-language message. Photo fields are only returned when sent, so an
 * old client never clears a photo.
 */
export function validateLoreInput(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const number = typeof body.number === 'string' && body.number.trim() !== '' ? Number(body.number) : body.number;
  if (!Number.isInteger(number) || number < LORE_NUMBER_MIN || number > LORE_NUMBER_MAX) {
    return { error: `Story number must be a whole number from ${LORE_NUMBER_MIN} to ${LORE_NUMBER_MAX}.` };
  }
  if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'Title is required.' };
  const title = body.title.replace(/\s+/g, ' ').trim();
  if (title.length > LORE_TITLE_MAX) return { error: `Title can be at most ${LORE_TITLE_MAX} characters.` };
  if (typeof body.body !== 'string' || !normalizeLoreBody(body.body)) return { error: 'The story text is required.' };
  const text = normalizeLoreBody(body.body);
  if (text.length > LORE_BODY_MAX) return { error: `The story text can be at most ${LORE_BODY_MAX} characters (it is ${text.length}).` };
  if (body.published !== undefined && typeof body.published !== 'boolean') return { error: 'Published must be on or off.' };
  const value = { number, title, body: text, published: body.published !== false };

  if (body.image_id !== undefined && body.image_id !== null && typeof body.image_id !== 'string') return { error: 'Story photo is invalid.' };
  if (body.image_id !== undefined) {
    const id = String(body.image_id ?? '').trim();
    if (id && !SITE_IMAGE_ID_RE.test(id)) return { error: 'Story photo is invalid.' };
    value.image_id = id;
  }
  if (body.image_alt !== undefined && body.image_alt !== null && typeof body.image_alt !== 'string') return { error: 'Photo description is invalid.' };
  if (body.image_alt !== undefined) {
    const alt = String(body.image_alt ?? '').replace(/\s+/g, ' ').trim();
    if (alt.length > LORE_ALT_MAX) return { error: `Photo description can be at most ${LORE_ALT_MAX} characters.` };
    value.image_alt = alt;
  }
  if (value.image_id === '') value.image_alt = '';
  else if (value.image_id && !value.image_alt) value.image_alt = title.slice(0, LORE_ALT_MAX); // blank description defaults to the title
  return { value };
}

/** { state: 'ok' (a real lore photo) | 'missing' | 'wrong-folder', doc? } */
export async function checkLoreImage(siteImages, imageId) {
  if (!imageId) return { state: 'missing' };
  const doc = await siteImages.findOne({ _id: String(imageId) });
  if (!doc) return { state: 'missing' };
  return doc.folder === LORE_IMAGE_FOLDER ? { state: 'ok', doc } : { state: 'wrong-folder' };
}

/**
 * After a photo changed or the story was removed: delete the old photo only when no other story still uses it.
 * Never throws: a Drive hiccup must not block saving text.
 */
export async function releaseLoreImage({ stories, imageId, removeImage }) {
  if (!imageId || !SITE_IMAGE_ID_RE.test(String(imageId))) return false;
  try {
    if (await stories.findOne({ image_id: imageId })) return false;
    return Boolean(await removeImage(imageId));
  } catch (error) {
    console.error('lore photo cleanup failed', error?.message || error);
    return false;
  }
}

/** What a visitor sees of a stored story: no Mongo id, a ready photo URL, the dimensions for layout. */
export function publicStory(doc) {
  if (!doc) return null;
  const url = loreImageUrl(doc.image_id);
  const width = Number(doc.image_width) > 0 ? Number(doc.image_width) : 0;
  const height = Number(doc.image_height) > 0 ? Number(doc.image_height) : 0;
  return {
    number: Number(doc.number),
    slug: loreSlug(doc.number),
    title: String(doc.title || ''),
    body: String(doc.body || ''),
    image: url ? { url, alt: String(doc.image_alt || doc.title || ''), width, height } : null,
    updated_at: doc.updated_at || null,
  };
}
