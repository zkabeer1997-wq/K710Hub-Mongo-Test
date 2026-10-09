// Alliance leadership: the structured `leaders` list on an alliance document.
//   [{ id, role, name, player_id?, discord_id? }]
// Pure helpers shared by the admin API (strict validation), the admin editor
// and the public pages. A Discord link is only ever built from a validated
// numeric user id that an admin typed; never from a username.

export const LEADER_ROLES = ['R5', 'R4', 'Transfer Manager'];
export const MAX_LEADERS = 12;
export const MAX_ROLE_LENGTH = 30;
export const MAX_NAME_LENGTH = 60;
export const MAX_ID_LENGTH = 40;

const DISCORD_ID_RE = /^\d{17,20}$/;
const DISCORD_URL_RE = /^https?:\/\/(?:www\.)?(?:discord|discordapp)\.com\/users\/(\d{17,20})\/?$/i;
const PLAYER_ID_RE = /^\d{1,20}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const ROLE_RE = /^[\p{L}\p{N}][\p{L}\p{N} ./&'-]*$/u;

// The Home page text keys that used to hold "R5: Name" for the original three alliances.
export const LEGACY_R5_KEYS = { '710': 'wb_1_desc', RED: 'wb_2_desc', SKY: 'wb_3_desc' };

/** Numeric user id from a pasted id or https://discord.com/users/<id> URL. '' = empty, null = not valid. */
export function normalizeDiscordId(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (DISCORD_ID_RE.test(raw)) return raw;
  const m = DISCORD_URL_RE.exec(raw);
  return m ? m[1] : null;
}

/** The profile link for a stored discord_id, or null when nothing valid is stored. */
export function discordUrl(discordId) {
  const id = String(discordId ?? '').trim();
  return DISCORD_ID_RE.test(id) ? `https://discord.com/users/${id}` : null;
}

/** Accessible name for the Discord link. */
export function discordLinkLabel(name) {
  return `Message ${String(name ?? '').trim()} on Discord`;
}

function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Strict validation for an admin save. Returns { leaders } (cleaned, ready to store)
 * or { error } with a message an admin can act on.
 */
export function validateLeaders(input) {
  if (input == null) return { leaders: [] };
  if (!Array.isArray(input)) return { error: 'Leaders must be a list.' };
  if (input.length > MAX_LEADERS) return { error: `Add at most ${MAX_LEADERS} leaders.` };
  const leaders = [];
  const seen = new Set();
  for (let i = 0; i < input.length; i += 1) {
    const row = input[i];
    const where = `Leader ${i + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: `${where} is not valid.` };
    const role = String(row.role ?? '').trim().replace(/\s+/g, ' ');
    const name = String(row.name ?? '').trim().replace(/\s+/g, ' ');
    if (!role) return { error: `${where}: choose or type a role.` };
    if (role.length > MAX_ROLE_LENGTH || !ROLE_RE.test(role)) return { error: `${where}: the role must be up to ${MAX_ROLE_LENGTH} letters or numbers.` };
    if (!name) return { error: `${where}: enter a name.` };
    if (name.length > MAX_NAME_LENGTH || CONTROL_RE.test(name)) return { error: `${where}: the name must be up to ${MAX_NAME_LENGTH} characters.` };
    let playerId = String(row.player_id ?? '').trim();
    if (playerId && !PLAYER_ID_RE.test(playerId)) return { error: `${where}: the Player ID must be numbers only.` };
    const discord = normalizeDiscordId(row.discord_id);
    if (discord === null) return { error: `${where}: the Discord ID must be 17 to 20 digits, or a https://discord.com/users/<id> link.` };
    let id = String(row.id ?? '').trim();
    if (!id || id.length > MAX_ID_LENGTH || !/^[\w-]+$/.test(id) || seen.has(id)) id = newId();
    seen.add(id);
    const leader = { id, role, name };
    if (playerId) leader.player_id = playerId;
    if (discord) leader.discord_id = discord;
    leaders.push(leader);
  }
  return { leaders };
}

/** "R5: Name" line from the Home page text (the old single source of the R5 name). */
export function parseLegacyR5(text) {
  const m = /R5\s*:\s*([^\n]+)/i.exec(text || '');
  return m ? m[1].trim() : '';
}

/**
 * Leaders to show for an alliance. If the document has a `leaders` list it wins
 * (even when empty: an admin removed everyone). Otherwise the R5 line is derived
 * from the legacy Home page text so nothing disappears before the migration runs.
 * Returns public-safe rows only: { id, role, name, discord_id? } (never player_id).
 */
export function resolveLeaders(alliance, homeText = {}) {
  if (alliance && Array.isArray(alliance.leaders)) {
    const out = [];
    for (const row of alliance.leaders) {
      const role = String(row?.role ?? '').trim();
      const name = String(row?.name ?? '').trim();
      if (!role || !name) continue;
      const leader = { id: String(row.id || `${role}-${out.length}`), role, name };
      if (discordUrl(row.discord_id)) leader.discord_id = String(row.discord_id).trim();
      out.push(leader);
    }
    return sortLeaders(out);
  }
  const key = LEGACY_R5_KEYS[String(alliance?.tag ?? '').toUpperCase()];
  const legacy = key ? parseLegacyR5(homeText?.[key]) : '';
  return legacy ? [{ id: 'legacy-r5', role: 'R5', name: legacy }] : [];
}

/** True when the document still relies on the read-time fallback (no `leaders` list yet). */
export function usesLegacyLeaders(alliance) {
  return !(alliance && Array.isArray(alliance.leaders));
}

/** R5 first, then R4, Transfer Manager, then any other role in stored order. */
export function sortLeaders(leaders) {
  const rank = (l) => { const i = LEADER_ROLES.indexOf(l.role); return i < 0 ? LEADER_ROLES.length : i; };
  return leaders.map((l, i) => [l, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([l]) => l);
}

/** Display model for one leader: the link exists only when a valid Discord id is stored. */
export function leaderView(leader) {
  const href = discordUrl(leader?.discord_id);
  return { id: leader.id, role: leader.role, name: leader.name, href, linkLabel: href ? discordLinkLabel(leader.name) : null };
}

/**
 * Plan for scripts/migrate-alliance-leaders.mjs: for every alliance that has no `leaders`
 * list yet and whose legacy Home text names an R5, the list to store. Alliances that already
 * have `leaders` (even an empty one) are never touched, so re-running changes nothing.
 */
export function planLeaderMigration(alliances, homeText = {}) {
  const plan = [];
  for (const alliance of Array.isArray(alliances) ? alliances : []) {
    if (!usesLegacyLeaders(alliance)) continue;
    const derived = resolveLeaders(alliance, homeText);
    if (!derived.length) continue;
    plan.push({ tag: alliance.tag, leaders: derived.map((l) => ({ id: newId(), role: l.role, name: l.name })) });
  }
  return plan;
}
