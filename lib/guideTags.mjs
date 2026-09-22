/**
 * Pure helpers for the Guides listing's optional visual-hierarchy tags
 * (#19 — difficulty tag + "Start here" badge).
 *
 * Both are strictly additive: the guide schema (lib/guideValidation.mjs)
 * has no `difficulty` field and no DB write is required. When a guide
 * doesn't carry the optional data, these helpers return null and the
 * directory renders nothing extra for it.
 */

const DIFFICULTY_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

/**
 * @param {{difficulty?: unknown}} guide
 * @returns {'Beginner'|'Intermediate'|'Advanced'|null} the guide's
 *   difficulty label when it carries a valid optional `difficulty` field,
 *   otherwise null (never fabricated for guides that don't set one).
 */
export function guideDifficultyLabel(guide) {
  const value = typeof guide?.difficulty === 'string' ? guide.difficulty.trim() : '';
  return DIFFICULTY_LEVELS.includes(value) ? value : null;
}

/**
 * Picks the single guide to badge "Start here", without requiring a
 * schema change. An admin can opt a guide in explicitly with an optional
 * `start_here: true` field; absent that, the lowest `position` value in
 * the already-published, already-sorted list is used as the curated
 * recommended-order fallback (guides are sorted by `position` server-side
 * — see app/guides/page.js's `.sort({ position: 1, title: 1 })`).
 *
 * @param {Array<{slug?: string, position?: unknown, start_here?: unknown}>} guides
 * @returns {string|null} the slug of the guide to badge, or null when
 *   `guides` is empty.
 */
export function startHereSlug(guides) {
  const list = Array.isArray(guides) ? guides : [];
  if (!list.length) return null;
  const explicit = list.find((g) => g?.start_here === true);
  if (explicit) return explicit.slug ?? null;
  const sorted = [...list].sort((a, b) => {
    const posA = Number.isFinite(Number(a?.position)) ? Number(a.position) : Number.POSITIVE_INFINITY;
    const posB = Number.isFinite(Number(b?.position)) ? Number(b.position) : Number.POSITIVE_INFINITY;
    return posA - posB;
  });
  return sorted[0]?.slug ?? null;
}
