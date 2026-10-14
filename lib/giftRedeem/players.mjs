// Pure parsing/validation for gift redeem players. No Node-only imports: the admin page uses
// parseBotImport() in the browser, and the API re-validates everything it receives.

export const MAX_PLAYERS_PER_REQUEST = 1000;
export const MAX_BODY_CHARS = 250_000;

/** Player IDs are digits, 4 to 20 long. */
export function normalizePlayerId(value) {
  const s = String(value ?? '').trim();
  return /^\d{4,20}$/.test(s) ? s : null;
}

/** Kingdom numbers are digits, 1 to 4 long (leading zeros removed). */
export function normalizeKingdom(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = String(Number(s));
  return n === '0' ? null : n;
}

/** "ID kingdom" per line; separators: space, comma, semicolon, tab, colon. */
export function parsePlayerLines(text) {
  const valid = [];
  const rejected = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const [idPart, kingdomPart, ...extra] = line.split(/[\s,;:|]+/);
    const player_id = normalizePlayerId(idPart);
    const kingdom_id = normalizeKingdom(kingdomPart);
    if (!player_id || !kingdom_id || extra.length) {
      if (rejected.length < 20) rejected.push(line.slice(0, 60));
      continue;
    }
    if (seen.has(player_id)) continue;
    seen.add(player_id);
    valid.push({ player_id, kingdom_id });
  }
  return { valid: valid.slice(0, MAX_PLAYERS_PER_REQUEST), rejected, truncated: valid.length > MAX_PLAYERS_PER_REQUEST };
}

/**
 * Reads the bot's data files (already JSON.parse'd):
 *  - player_ids.json:        { playerIds: [], failedPlayerIds: [], kingdomByPlayerId: { id: kingdom } }
 *  - player_submissions.json: { userPlayerIds: { discordId: { playerId, kingdom } } }
 * A file that matches neither shape returns kind "unknown". Players without a usable kingdom are counted, not imported.
 */
export function parseBotImport(json) {
  const out = { kind: 'unknown', players: [], skipped_no_kingdom: 0, invalid: 0, duplicates: 0 };
  if (!json || typeof json !== 'object') return out;
  const seen = new Map();
  const add = (idRaw, kingdomRaw, failed) => {
    const player_id = normalizePlayerId(idRaw);
    if (!player_id) { out.invalid += 1; return; }
    const kingdom_id = normalizeKingdom(kingdomRaw);
    if (!kingdom_id) { out.skipped_no_kingdom += 1; return; }
    if (seen.has(player_id)) {
      out.duplicates += 1;
      if (failed) seen.get(player_id).failed = true;
      return;
    }
    const row = { player_id, kingdom_id, failed: Boolean(failed) };
    seen.set(player_id, row);
    out.players.push(row);
  };
  if (Array.isArray(json.playerIds) || Array.isArray(json.failedPlayerIds) || json.kingdomByPlayerId) {
    out.kind = 'player_ids';
    const kmap = json.kingdomByPlayerId && typeof json.kingdomByPlayerId === 'object' ? json.kingdomByPlayerId : {};
    const failedSet = new Set((Array.isArray(json.failedPlayerIds) ? json.failedPlayerIds : []).map((x) => String(x).trim()));
    const ids = [...(Array.isArray(json.playerIds) ? json.playerIds : []), ...failedSet];
    for (const id of ids) add(id, kmap[String(id).trim()], failedSet.has(String(id).trim()));
  } else if (json.userPlayerIds && typeof json.userPlayerIds === 'object') {
    out.kind = 'player_submissions';
    for (const entry of Object.values(json.userPlayerIds)) add(entry?.playerId, entry?.kingdom, false);
  }
  return out;
}
