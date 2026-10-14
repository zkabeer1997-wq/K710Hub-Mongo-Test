/**
 * Per-member gift code summaries for the Member PINs table (real data from gift_players,
 * gift_redemptions and gift_codes). Code discovery lives in lib/giftCodeDiscovery.mjs and the
 * redeem runner in lib/giftRedeem/*.
 */

export const REDEEMED_STATUSES = new Set(['success', 'received']);

/**
 * @param {Array} players      gift_players rows
 * @param {Array} redemptions  gift_redemptions rows (any order)
 * @param {Array} activeCodes  gift_codes rows that are currently active
 * @returns {Map<string, object>} keyed by member id (the player's member_id, else the player id)
 */
export function summarizeGiftCodeStatusByMember(players, redemptions, activeCodes = []) {
  const byPlayer = new Map();
  for (const r of redemptions || []) {
    const key = String(r.player_id);
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(r);
  }
  const activeSet = new Set((activeCodes || []).map((c) => c.code));
  const stamp = (r) => new Date(r.updated_at || 0).getTime();
  const summaries = new Map();
  for (const player of players || []) {
    const history = (byPlayer.get(String(player.player_id)) || []).slice().sort((a, b) => stamp(b) - stamp(a));
    const redeemed = history.filter((h) => REDEEMED_STATUSES.has(h.status)).length;
    const failed = history.length - redeemed;
    const done = new Set(history.map((h) => h.code));
    const pending = player.enabled && !player.failed ? [...activeSet].filter((c) => !done.has(c)).length : 0;
    summaries.set(String(player.member_id || player.player_id), {
      enrolled: true,
      enabled: Boolean(player.enabled),
      playerFailed: Boolean(player.failed),
      playerId: player.player_id,
      redeemed,
      pending,
      failed,
      latestStatus: history[0]?.status || null,
      latestCode: history[0]?.code || null,
    });
  }
  return summaries;
}

const NOT_ENROLLED_GIFT_STATUS = Object.freeze({
  enrolled: false,
  enabled: false,
  playerFailed: false,
  playerId: null,
  redeemed: 0,
  pending: 0,
  failed: 0,
  latestStatus: null,
  latestCode: null,
});

export function mergeGiftCodeStatusIntoRows(rows, summariesByMember) {
  return (rows || []).map((row) => ({
    ...row,
    gift_code: summariesByMember.get(String(row.member_id)) || NOT_ENROLLED_GIFT_STATUS,
  }));
}
