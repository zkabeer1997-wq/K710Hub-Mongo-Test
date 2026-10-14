// In-memory implementation of the gift redeem store. Used by unit tests (and as the reference for
// the Mongo store: tests/giftRedeemStoreContract.test.mjs runs the same checks against both).
//
// Store contract (all async): see mongoStore.mjs for the Mongo twin.

const FINAL_UNFINISHED = new Set(['skipped', 'unknown']);

function byCreated(a, b) {
  return (a.created_at?.getTime?.() ?? 0) - (b.created_at?.getTime?.() ?? 0) || String(a.player_id).localeCompare(String(b.player_id));
}

export function createMemoryStore({ codes = [], nowFn = () => new Date() } = {}) {
  const codeMap = new Map(codes.map((c) => [c.code, { active: true, redeem_status: 'queued', discovered_at: nowFn(), ...c }]));
  const players = new Map();
  const redemptions = new Map(); // `${code}|${pid}` -> row
  const audit = [];
  let runner = { _id: 'runner', auto_redeem_enabled: false, lease_owner: null, lease_until: 0 };

  const store = {
    kind: 'memory',
    // ---- runner / settings ----
    async getRunner() { return { ...runner }; },
    async patchRunner(patch) { runner = { ...runner, ...patch }; },
    async setAutoRedeem(enabled, by = null) { runner = { ...runner, auto_redeem_enabled: Boolean(enabled), auto_redeem_changed_by: by }; },
    async acquireLease(owner, nowMs, leaseMs) {
      if (runner.lease_owner && runner.lease_until > nowMs && runner.lease_owner !== owner) return false;
      runner = { ...runner, lease_owner: owner, lease_until: nowMs + leaseMs };
      return true;
    },
    async renewLease(owner, nowMs, leaseMs) {
      if (runner.lease_owner !== owner) return false;
      runner = { ...runner, lease_until: nowMs + leaseMs };
      return true;
    },
    async releaseLease(owner, patch = {}) {
      if (runner.lease_owner !== owner) return false;
      runner = { ...runner, ...patch, lease_owner: null, lease_until: 0 };
      return true;
    },
    // ---- codes ----
    async listCodes() { return [...codeMap.values()].map((c) => ({ ...c })); },
    async getCode(code) { const c = codeMap.get(code); return c ? { ...c } : null; },
    async listActiveCodes() {
      return [...codeMap.values()]
        .filter((c) => c.active !== false && c.redeem_status !== 'expired')
        .sort((a, b) => (a.discovered_at?.getTime?.() ?? 0) - (b.discovered_at?.getTime?.() ?? 0))
        .map((c) => ({ ...c }));
    },
    async setCodeActive(code, active, { reason = null, now = nowFn() } = {}) {
      const c = codeMap.get(code);
      if (!c) return false;
      Object.assign(c, active
        ? { active: true, expired_at: null, expired_reason: null, redeem_status: 'queued', updated_at: now }
        : { active: false, expired_at: now, expired_reason: reason || 'manual', redeem_status: 'paused', updated_at: now });
      return true;
    },
    async deleteCode(code) {
      const existed = codeMap.delete(code);
      let rows = 0;
      for (const key of [...redemptions.keys()]) if (key.startsWith(`${code}|`)) { redemptions.delete(key); rows += 1; }
      return { deleted: existed, redemption_rows: rows };
    },
    async setCodeRedeemStatus(code, status) {
      const c = codeMap.get(code);
      if (c && c.redeem_status !== 'expired') c.redeem_status = status;
    },
    async markCodeExpired(code, now = nowFn()) {
      const c = codeMap.get(code);
      if (c) Object.assign(c, { active: false, expired_at: now, expired_reason: 'game_expired', redeem_status: 'expired', updated_at: now });
    },
    async requeueCode(code) {
      let removed = 0;
      for (const [key, row] of redemptions) {
        if (row.code === code && FINAL_UNFINISHED.has(row.status)) { redemptions.delete(key); removed += 1; }
      }
      const c = codeMap.get(code);
      if (c && c.redeem_status !== 'expired') c.redeem_status = 'queued';
      return { removed };
    },
    // ---- players ----
    async addPlayers(list, { now = nowFn() } = {}) {
      let added = 0;
      let existing = 0;
      for (const p of list) {
        if (players.has(p.player_id)) { existing += 1; continue; }
        players.set(p.player_id, {
          player_id: p.player_id,
          kingdom_id: p.kingdom_id,
          source: p.source,
          member_id: p.member_id || null,
          enabled: p.enabled !== false,
          failed: Boolean(p.failed),
          failed_at: p.failed ? now : null,
          added_by: p.added_by || null,
          created_at: now,
          updated_at: now,
        });
        added += 1;
      }
      return { added, existing };
    },
    async getPlayer(pid) { const p = players.get(pid); return p ? { ...p } : null; },
    async listPlayers({ enabled, failed, source, kingdom, q, skip = 0, limit = 50 } = {}) {
      let rows = [...players.values()];
      if (enabled !== undefined) rows = rows.filter((p) => p.enabled === enabled);
      if (failed !== undefined) rows = rows.filter((p) => p.failed === failed);
      if (source) rows = rows.filter((p) => p.source === source);
      if (kingdom) rows = rows.filter((p) => p.kingdom_id === kingdom);
      if (q) rows = rows.filter((p) => p.player_id.includes(q));
      rows.sort(byCreated);
      return { total: rows.length, rows: rows.slice(skip, skip + limit).map((p) => ({ ...p })) };
    },
    async setPlayerEnabled(pid, enabled, now = nowFn()) {
      const p = players.get(pid);
      if (!p) return false;
      Object.assign(p, { enabled: Boolean(enabled), updated_at: now });
      return true;
    },
    async removePlayer(pid) { return players.delete(pid); },
    async reenablePlayer(pid, now = nowFn()) {
      const p = players.get(pid);
      if (!p) return false;
      Object.assign(p, { failed: false, failed_at: null, enabled: true, updated_at: now });
      return true;
    },
    async markPlayerFailed(pid, now = nowFn()) {
      const p = players.get(pid);
      if (p) Object.assign(p, { failed: true, failed_at: now, updated_at: now });
    },
    async listRunnablePlayers() {
      return [...players.values()].filter((p) => p.enabled && !p.failed).sort(byCreated).map((p) => ({ ...p }));
    },
    async setMemberOptIn({ memberId, playerId, kingdomId, enabled, now = nowFn() }) {
      const p = players.get(playerId);
      if (!p) {
        if (!enabled) return null;
        players.set(playerId, {
          player_id: playerId, kingdom_id: kingdomId, source: 'member', member_id: memberId, enabled: true,
          failed: false, failed_at: null, added_by: memberId, created_at: now, updated_at: now,
        });
      } else {
        Object.assign(p, { member_id: memberId, enabled: Boolean(enabled), updated_at: now });
      }
      return { ...players.get(playerId) };
    },
    async getMemberPlayer(memberId) {
      const p = [...players.values()].find((x) => x.member_id === memberId) || players.get(memberId);
      return p ? { ...p } : null;
    },
    async playerCounts() {
      const all = [...players.values()];
      return {
        total: all.length,
        enabled: all.filter((p) => p.enabled && !p.failed).length,
        disabled: all.filter((p) => !p.enabled).length,
        failed: all.filter((p) => p.failed).length,
      };
    },
    // ---- redemptions ----
    async finalPlayerIds(code) {
      const ids = new Set();
      for (const row of redemptions.values()) if (row.code === code) ids.add(row.player_id);
      return ids;
    },
    async saveRedemption(row) {
      redemptions.set(`${row.code}|${row.player_id}`, { ...row });
    },
    async searchRedemptions({ q = '', skip = 0, limit = 50 } = {}) {
      let rows = [...redemptions.values()];
      if (q) rows = rows.filter((r) => r.player_id === q || r.code.toLowerCase().includes(q.toLowerCase()));
      rows.sort((a, b) => (b.updated_at?.getTime?.() ?? 0) - (a.updated_at?.getTime?.() ?? 0));
      return { total: rows.length, rows: rows.slice(skip, skip + limit).map((r) => ({ ...r })) };
    },
    async redemptionsForPlayer(pid) {
      return [...redemptions.values()].filter((r) => r.player_id === pid).map((r) => ({ ...r }));
    },
    async countsByCode() {
      const out = {};
      for (const r of redemptions.values()) {
        out[r.code] ||= {};
        out[r.code][r.status] = (out[r.code][r.status] || 0) + 1;
      }
      return out;
    },
    // ---- audit ----
    async addAudit(entry) { audit.unshift({ ...entry }); },
    async listAudit(limit = 20) { return audit.slice(0, limit).map((a) => ({ ...a })); },
  };
  return store;
}
