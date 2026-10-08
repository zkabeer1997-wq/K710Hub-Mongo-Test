import { ExternalError, cleanText, isPlainObject, isoDate, toInt } from './sanitize.mjs';
import { TIMELINE_MILESTONES } from '../kingdomExternalData.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_MILESTONES = 200;

/**
 * Validate the Optimizer's kingdom-timeline JSON
 *   { success, result: { kingdomNumber, createdDate, unlocks: { slug: 'YYYY-MM-DD' } } }
 * into { kingdom, createdDate, milestones: [{ slug, date }] } sorted by date.
 * Entries that are not a known-shaped slug + real date are dropped; a response
 * with no usable milestones is a "shape" error so the caller keeps the snapshot.
 */
export function parseTimelineResponse(json) {
  const result = isPlainObject(json) ? json.result : null;
  if (!isPlainObject(json) || json.success === false || !isPlainObject(result) || !isPlainObject(result.unlocks)) {
    throw new ExternalError('shape', 'Timeline response has an unexpected shape');
  }
  const milestones = [];
  for (const [slug, date] of Object.entries(result.unlocks).slice(0, MAX_MILESTONES * 2)) {
    const d = isoDate(date);
    if (!SLUG_RE.test(slug) || !d) continue;
    milestones.push({ slug, date: d });
    if (milestones.length >= MAX_MILESTONES) break;
  }
  if (milestones.length === 0) throw new ExternalError('shape', 'Timeline response had no usable milestones');
  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    kingdom: toInt(result.kingdomNumber, { min: 1, max: 99999 }),
    createdDate: isoDate(result.createdDate),
    milestones,
  };
}

// ---- Labels: the source returns slugs only; titles/categories/notes come from our hand-written list. ----

export function slugifyTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/\bgeneration (\d+)/g, 'gen$1')
    .replace(/\bcompetition\b/g, 'battle')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const KNOWN = new Map(TIMELINE_MILESTONES.map((m) => [slugifyTitle(m.title), m]));

export function humanizeSlug(slug) {
  const SMALL = new Set(['and', 'of', 'the', 'to', 'in', 'a', 'for']);
  const words = String(slug).split('-').filter(Boolean).map((w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    const gen = /^gen(\d+)$/.exec(w);
    if (gen) return `Generation ${gen[1]}`;
    if (w === 'kvk') return 'KvK';
    if (w === 'hog') return 'HoG';
    if (/^\d+(st|nd|rd|th)$/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  return cleanText(words.join(' '), 90);
}

export function guessCategory(slug) {
  if (/^gen\d+-heroes/.test(slug)) return 'Heroes';
  if (/^gen\d+-pets/.test(slug)) return 'Pets';
  if (/truegold/.test(slug)) return 'Truegold';
  if (/battle|kvk|brawl|competition/.test(slug)) return 'PvP';
  return 'New Feature';
}

export function describeMilestone(slug) {
  const known = KNOWN.get(slug);
  if (known) return { title: known.title, category: known.category, notes: known.notes || '' };
  return { title: humanizeSlug(slug), category: guessCategory(slug), notes: '' };
}
