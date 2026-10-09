// Access rules for guide BODY images (/api/guide-images/<uuid>.<ext>, rows in guide_attachments).
// An attachment has no owner field that stays true (it records where it was uploaded, not where it is
// used), so access is derived at read time from the guides that contain its file name in their layout,
// legacy markdown body or tab content. No schema change and no backfill is needed.
//   - used by a published members-only guide  -> 'members' (member session or admin)
//   - used only by published public guides    -> 'public'
//   - used by no published guide              -> 'admin'  (just uploaded, unsaved, draft-only, unpublished)
// Strictest reference wins. A draft can only tighten access.

/** Public guide images are revalidated hourly (not immutable) so a guide that turns members-only drops out of caches fast. */
export const GUIDE_BODY_PUBLIC_CACHE = 'public, max-age=3600, must-revalidate';
export const GUIDE_BODY_PRIVATE_CACHE = 'private, no-store';
export const GUIDE_BODY_ROWS_TTL_MS = 10_000;

export const GUIDE_BODY_PROJECTION = { slug: 1, is_published: 1, access_level: 1, body: 1, f2p_content: 1, spender_content: 1, layout: 1, 'draft.layout': 1, 'draft.access_level': 1, 'draft.body': 1, _id: 0 };

const text = (value) => (value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value));

/** @returns {'public'|'members'|'admin'} */
export function guideBodyImageAccess(guides, file) {
  let level = 'admin';
  let draftMembers = false;
  for (const g of guides || []) {
    if (g?.draft && g.draft.access_level === 'members' && (text(g.draft.layout).includes(file) || text(g.draft.body).includes(file))) draftMembers = true;
    if (!g?.is_published) continue;
    if (![g.layout, g.body, g.f2p_content, g.spender_content].some((part) => text(part).includes(file))) continue;
    if (g.access_level !== 'public') return 'members';
    level = 'public';
  }
  return level === 'public' && draftMembers ? 'members' : level;
}

/** Tiny TTL cache around the guide loader (a page shows many images; guides are few). ttl 0 disables it. */
export function createGuideRowsCache(load, { ttl = GUIDE_BODY_ROWS_TTL_MS, now = () => Date.now() } = {}) {
  let entry = null;
  return async () => {
    if (ttl > 0 && entry && now() - entry.at < ttl) return entry.rows;
    const rows = await load();
    entry = { at: now(), rows };
    return rows;
  };
}
