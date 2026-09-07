/**
 * Gift code helpers — Mongo test stack.
 * Wiki parser + pure summary helpers preserved.
 * Supabase RPC enrollment/redemption paths return empty/no-op results.
 */

export const WIKI_GIFT_CODES_URL = 'https://kingshotwiki.com/giftcodes/';
export const REDEMPTION_SITE_URL = 'https://ks-giftcode.centurygame.com/';
export const KINGDOM_DEFAULT = 710;

export const MEMBER_CONFIRM_RESULTS = new Set(['redeemed', 'already_redeemed', 'skipped']);
export const TERMINAL_STATUSES = new Set([
  'redeemed',
  'already_redeemed',
  'expired',
  'invalid_code',
  'invalid_player',
  'skipped',
]);

export function parseWikiGiftCodes(html) {
  if (!html || typeof html !== 'string') {
    return { codes: [], warning: 'empty_html' };
  }
  const activeMatch = html.match(/Active\s*Codes/i);
  if (!activeMatch) {
    return { codes: [], warning: 'unexpected_page_structure' };
  }
  const afterActive = html.slice(activeMatch.index + activeMatch[0].length);
  const conciergeMatch = afterActive.match(/Concierge/i);
  const activeSection = conciergeMatch ? afterActive.slice(0, conciergeMatch.index) : afterActive;
  const codeRe = /<span[^>]*class=["'][^"']*\bcode\b[^"']*["'][^>]*>([^<]+)<\/span>/gi;
  const codes = new Set();
  let m;
  while ((m = codeRe.exec(activeSection)) !== null) {
    const code = m[1].trim();
    if (code) codes.add(code);
  }
  if (codes.size === 0) {
    return { codes: [], warning: 'unexpected_page_structure' };
  }
  return { codes: [...codes] };
}

export async function discoverWikiCodes() {
  return { success: false, codes: [], newCodes: 0, deactivated: 0, warning: 'mongo_test_stack_stub' };
}

export async function queueActiveCodesForAllEnrollments() {
  return 0;
}

export async function enrollMemberForGiftCodes() {
  return null;
}

export async function confirmMemberRedemption() {
  throw new Error('Gift code redemptions are not wired on the Mongo test stack.');
}

export async function getMemberGiftStatus() {
  return { enrolled: false, enabled: false, history: [] };
}

export async function getAdminGiftOverview() {
  try {
    const { getCollection } = await import('./mongo.js');
    const { COLLECTIONS } = await import('./mongoCollections.js');
    const coll = await getCollection(COLLECTIONS.GIFT_CODES);
    const codes = await coll.find({}).sort({ discovered_at: -1 }).limit(50).toArray();
    return {
      codes: codes.map(({ _id, ...c }) => ({ ...c, id: c.id || String(_id) })),
      lastCheck: null,
      totals: { pending: 0, redeemed: 0, already_redeemed: 0, skipped: 0 },
    };
  } catch {
    return {
      codes: [],
      lastCheck: null,
      totals: { pending: 0, redeemed: 0, already_redeemed: 0, skipped: 0 },
    };
  }
}

export function summarizeGiftCodeStatusByMember(enrollments, redemptions) {
  const historyByPlayer = new Map();
  for (const redemption of redemptions || []) {
    const key = String(redemption.player_id);
    if (!historyByPlayer.has(key)) historyByPlayer.set(key, []);
    historyByPlayer.get(key).push(redemption);
  }
  const summaries = new Map();
  for (const enrollment of enrollments || []) {
    const history = historyByPlayer.get(String(enrollment.player_id)) || [];
    const redeemed = history.filter(
      (h) => h.status === 'redeemed' || h.status === 'already_redeemed'
    ).length;
    const pending = history.filter(
      (h) => h.status === 'pending' || h.status === 'processing'
    ).length;
    const failed = history.length - redeemed - pending;
    summaries.set(String(enrollment.member_id), {
      enrolled: true,
      enabled: Boolean(enrollment.enabled),
      playerId: enrollment.player_id,
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

export async function getAdminMemberGiftSummaries() {
  return new Map();
}
