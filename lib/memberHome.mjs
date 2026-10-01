// Pure helpers for the logged-in homepage (safe to unit test).

/** Friendly first name: nickname unless it is just the player ID (legacy PIN session). */
export function displayNameFor(session) {
  const nick = String(session?.nickname || '').trim();
  if (!nick || nick === String(session?.memberId || '')) return '';
  return nick;
}

/** Match a free-text alliance label against the published alliance tags. */
export function resolveAllianceTag(candidates, tags) {
  const upper = new Map(tags.map((t) => [String(t).toUpperCase(), t]));
  for (const c of candidates) {
    const hit = upper.get(String(c || '').trim().toUpperCase());
    if (hit) return hit;
  }
  return null;
}
