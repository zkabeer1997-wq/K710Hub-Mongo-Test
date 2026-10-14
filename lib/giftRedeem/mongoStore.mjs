// MongoDB implementation of the gift redeem store (twin of memoryStore.mjs).
// `db` is a Mongo Db (anything with .collection(name)). Collections: gift_codes, gift_players,
// gift_redemptions, gift_runner (one doc, _id "runner"), gift_audit.
import { COLLECTIONS } from '../mongoCollections.js';

const RUNNER_ID = 'runner';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const clean = ({ _id, ...rest }) => rest;

export function createMongoStore(db) {
  const codes = () => db.collection(COLLECTIONS.GIFT_CODES);
  const players = () => db.collection(COLLECTIONS.GIFT_PLAYERS);
  const reds = () => db.collection(COLLECTIONS.GIFT_REDEMPTIONS);
  const runner = () => db.collection(COLLECTIONS.GIFT_RUNNER);
  const auditColl = () => db.collection(COLLECTIONS.GIFT_AUDIT);

  return {
    kind: 'mongo',
    // ---- runner / settings ----
    async getRunner() { return (await runner().findOne({ _id: RUNNER_ID })) || { _id: RUNNER_ID, auto_redeem_enabled: false }; },
    async patchRunner(patch) { await runner().updateOne({ _id: RUNNER_ID }, { $set: patch }, { upsert: true }); },
    async setAutoRedeem(enabled, by = null) {
      await runner().updateOne({ _id: RUNNER_ID }, { $set: { auto_redeem_enabled: Boolean(enabled), auto_redeem_changed_by: by, auto_redeem_changed_at: new Date() } }, { upsert: true });
    },
    async acquireLease(owner, nowMs, leaseMs) {
      try {
        await runner().updateOne(
          { _id: RUNNER_ID, $or: [{ lease_owner: null }, { lease_until: { $lte: nowMs } }, { lease_owner: owner }] },
          { $set: { lease_owner: owner, lease_until: nowMs + leaseMs } },
          { upsert: true },
        );
        return true;
      } catch (error) {
        if (error?.code === 11000) return false; // somebody else holds a live lease
        throw error;
      }
    },
    async renewLease(owner, nowMs, leaseMs) {
      const r = await runner().updateOne({ _id: RUNNER_ID, lease_owner: owner }, { $set: { lease_until: nowMs + leaseMs } });
      return r.matchedCount === 1;
    },
    async releaseLease(owner, patch = {}) {
      const r = await runner().updateOne({ _id: RUNNER_ID, lease_owner: owner }, { $set: { ...patch, lease_owner: null, lease_until: 0 } });
      return r.matchedCount === 1;
    },
    // ---- codes ----
    async listCodes() { return (await codes().find({}).sort({ discovered_at: -1, created_at: -1 }).toArray()).map(clean); },
    async getCode(code) { const c = await codes().findOne({ code }); return c ? clean(c) : null; },
    async listActiveCodes() {
      return (await codes().find({ active: { $ne: false }, redeem_status: { $ne: 'expired' } }).sort({ discovered_at: 1, created_at: 1 }).toArray()).map(clean);
    },
    async setCodeActive(code, active, { reason = null, now = new Date() } = {}) {
      const set = active
        ? { active: true, expired_at: null, expired_reason: null, redeem_status: 'queued', updated_at: now }
        : { active: false, expired_at: now, expired_reason: reason || 'manual', redeem_status: 'paused', updated_at: now };
      return (await codes().updateOne({ code }, { $set: set })).matchedCount === 1;
    },
    async deleteCode(code) {
      const d = await codes().deleteOne({ code });
      const r = await reds().deleteMany({ code });
      return { deleted: d.deletedCount === 1, redemption_rows: r.deletedCount };
    },
    async setCodeRedeemStatus(code, status) {
      await codes().updateOne({ code, redeem_status: { $ne: 'expired' } }, { $set: { redeem_status: status } });
    },
    async markCodeExpired(code, now = new Date()) {
      await codes().updateOne({ code }, { $set: { active: false, expired_at: now, expired_reason: 'game_expired', redeem_status: 'expired', updated_at: now } });
    },
    async requeueCode(code) {
      const r = await reds().deleteMany({ code, status: { $in: ['skipped', 'unknown'] } });
      await codes().updateOne({ code, redeem_status: { $ne: 'expired' } }, { $set: { redeem_status: 'queued' } });
      return { removed: r.deletedCount };
    },
    // ---- players ----
    async addPlayers(list, { now = new Date() } = {}) {
      if (!list.length) return { added: 0, existing: 0 };
      const ids = list.map((p) => p.player_id);
      const have = new Set((await players().find({ player_id: { $in: ids } }).project({ player_id: 1 }).toArray()).map((p) => p.player_id));
      const fresh = list.filter((p) => !have.has(p.player_id));
      let added = 0;
      if (fresh.length) {
        const res = await players().bulkWrite(fresh.map((p) => ({
          updateOne: {
            filter: { player_id: p.player_id },
            update: {
              $setOnInsert: {
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
              },
            },
            upsert: true,
          },
        })), { ordered: false });
        added = res.upsertedCount;
      }
      return { added, existing: list.length - added };
    },
    async getPlayer(pid) { const p = await players().findOne({ player_id: pid }); return p ? clean(p) : null; },
    async listPlayers({ enabled, failed, source, kingdom, q, skip = 0, limit = 50 } = {}) {
      const filter = {};
      if (enabled !== undefined) filter.enabled = enabled;
      if (failed !== undefined) filter.failed = failed;
      if (source) filter.source = source;
      if (kingdom) filter.kingdom_id = kingdom;
      if (q) filter.player_id = { $regex: `^${escapeRegex(q)}` };
      const [total, rows] = await Promise.all([
        players().countDocuments(filter),
        players().find(filter).sort({ created_at: 1, player_id: 1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, rows: rows.map(clean) };
    },
    async setPlayerEnabled(pid, enabled, now = new Date()) {
      return (await players().updateOne({ player_id: pid }, { $set: { enabled: Boolean(enabled), updated_at: now } })).matchedCount === 1;
    },
    async removePlayer(pid) { return (await players().deleteOne({ player_id: pid })).deletedCount === 1; },
    async reenablePlayer(pid, now = new Date()) {
      return (await players().updateOne({ player_id: pid }, { $set: { failed: false, failed_at: null, enabled: true, updated_at: now } })).matchedCount === 1;
    },
    async markPlayerFailed(pid, now = new Date()) {
      await players().updateOne({ player_id: pid }, { $set: { failed: true, failed_at: now, updated_at: now } });
    },
    async listRunnablePlayers() {
      return (await players().find({ enabled: true, failed: { $ne: true } }).sort({ created_at: 1, player_id: 1 }).toArray()).map(clean);
    },
    async setMemberOptIn({ memberId, playerId, kingdomId, enabled, now = new Date() }) {
      if (enabled) {
        await players().updateOne(
          { player_id: playerId },
          {
            $set: { member_id: memberId, enabled: true, updated_at: now },
            $setOnInsert: { player_id: playerId, kingdom_id: kingdomId, source: 'member', failed: false, failed_at: null, added_by: memberId, created_at: now },
          },
          { upsert: true },
        );
      } else {
        await players().updateOne({ player_id: playerId }, { $set: { member_id: memberId, enabled: false, updated_at: now } });
      }
      const p = await players().findOne({ player_id: playerId });
      return p ? clean(p) : null;
    },
    async getMemberPlayer(memberId) {
      const p = (await players().findOne({ member_id: memberId })) || (await players().findOne({ player_id: memberId }));
      return p ? clean(p) : null;
    },
    async playerCounts() {
      const [total, enabled, disabled, failed] = await Promise.all([
        players().countDocuments({}),
        players().countDocuments({ enabled: true, failed: { $ne: true } }),
        players().countDocuments({ enabled: false }),
        players().countDocuments({ failed: true }),
      ]);
      return { total, enabled, disabled, failed };
    },
    // ---- redemptions ----
    async finalPlayerIds(code) {
      const rows = await reds().find({ code }).project({ player_id: 1 }).toArray();
      return new Set(rows.map((r) => r.player_id));
    },
    async saveRedemption(row) {
      await reds().updateOne({ code: row.code, player_id: row.player_id }, { $set: row }, { upsert: true });
    },
    async searchRedemptions({ q = '', skip = 0, limit = 50 } = {}) {
      const filter = q ? { $or: [{ player_id: q }, { code: { $regex: escapeRegex(q), $options: 'i' } }] } : {};
      const [total, rows] = await Promise.all([
        reds().countDocuments(filter),
        reds().find(filter).sort({ updated_at: -1 }).skip(skip).limit(limit).toArray(),
      ]);
      return { total, rows: rows.map(clean) };
    },
    async redemptionsForPlayer(pid) { return (await reds().find({ player_id: pid }).toArray()).map(clean); },
    async countsByCode() {
      const agg = await reds().aggregate([{ $group: { _id: { code: '$code', status: '$status' }, n: { $sum: 1 } } }]).toArray();
      const out = {};
      for (const g of agg) {
        out[g._id.code] ||= {};
        out[g._id.code][g._id.status] = g.n;
      }
      return out;
    },
    // ---- audit ----
    async addAudit(entry) { await auditColl().insertOne({ ...entry }); },
    async listAudit(limit = 20) { return (await auditColl().find({}).sort({ at: -1 }).limit(limit).toArray()).map(clean); },
  };
}
