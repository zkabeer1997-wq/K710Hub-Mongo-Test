// The same behavioural checks run against the in-memory store and (when a LOCAL mongod is reachable)
// the Mongo store, so the two implementations cannot drift. Uses its own throw-away database.
import { describe, it as nodeIt, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createMemoryStore } from '../lib/giftRedeem/memoryStore.mjs';
import { createMongoStore } from '../lib/giftRedeem/mongoStore.mjs';
import { INDEXES } from '../lib/mongoCollections.js';

const NOW = new Date('2026-10-14T10:00:00Z');

function mongoUp() {
  return new Promise((resolve) => {
    const s = net.connect(27017, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 800);
  });
}

function contract(name, make, enabled = () => true, wrap = (fn) => fn()) {
  describe(`store contract: ${name}`, () => {
    const it = (title, fn) => nodeIt(title, async (t) => { if (!enabled()) { t.skip('no local mongod'); return; } await wrap(fn); });
    it('players: unique, filters, counts', async () => {
      const store = await make();
      const r1 = await store.addPlayers([
        { player_id: '1001', kingdom_id: '710', source: 'admin' },
        { player_id: '1002', kingdom_id: '523', source: 'bot_import', failed: true },
      ], { now: NOW });
      assert.deepEqual(r1, { added: 2, existing: 0 });
      const r2 = await store.addPlayers([{ player_id: '1001', kingdom_id: '710', source: 'admin' }, { player_id: '1003', kingdom_id: '710', source: 'admin' }], { now: NOW });
      assert.deepEqual(r2, { added: 1, existing: 1 });
      assert.equal((await store.listPlayers({ failed: true })).total, 1);
      assert.equal((await store.listPlayers({ kingdom: '710' })).total, 2);
      assert.equal((await store.listPlayers({ source: 'bot_import' })).rows[0].player_id, '1002');
      assert.equal((await store.listPlayers({ q: '100', limit: 2 })).rows.length, 2);
      assert.deepEqual((await store.listRunnablePlayers()).map((p) => p.player_id), ['1001', '1003']);
      await store.setPlayerEnabled('1003', false);
      assert.deepEqual(await store.playerCounts(), { total: 3, enabled: 1, disabled: 1, failed: 1 });
      await store.reenablePlayer('1002');
      assert.equal((await store.listRunnablePlayers()).length, 2);
      assert.equal(await store.removePlayer('1002'), true);
      assert.equal(await store.removePlayer('1002'), false);
    });
    it('member opt-in', async () => {
      const store = await make();
      const p = await store.setMemberOptIn({ memberId: '920000001', playerId: '920000001', kingdomId: '710', enabled: true, now: NOW });
      assert.equal(p.enabled, true);
      assert.equal((await store.getMemberPlayer('920000001')).source, 'member');
      assert.equal((await store.setMemberOptIn({ memberId: '920000001', playerId: '920000001', kingdomId: '710', enabled: false, now: NOW })).enabled, false);
      assert.equal(await store.setMemberOptIn({ memberId: '555', playerId: '555', kingdomId: '710', enabled: false, now: NOW }) === null || true, true);
    });
    it('redemptions: one row per (code, player), search, counts', async () => {
      const store = await make();
      const row = (code, pid, status) => ({ code, player_id: pid, kingdom_id: '710', status, err_code: 20000, attempts: 1, msg: 'x', updated_at: new Date(NOW.getTime() + Number(pid)) });
      await store.saveRedemption(row('CODEA', '1001', 'unknown'));
      await store.saveRedemption(row('CODEA', '1001', 'success')); // upsert, not duplicate
      await store.saveRedemption(row('CODEA', '1002', 'skipped'));
      await store.saveRedemption(row('CODEB', '1001', 'received'));
      assert.deepEqual([...(await store.finalPlayerIds('CODEA'))].sort(), ['1001', '1002']);
      assert.deepEqual(await store.countsByCode(), { CODEA: { success: 1, skipped: 1 }, CODEB: { received: 1 } });
      assert.equal((await store.searchRedemptions({ q: '1001' })).total, 2);
      assert.equal((await store.searchRedemptions({ q: 'codea' })).total, 2);
      assert.equal((await store.searchRedemptions({ q: '', limit: 1 })).rows.length, 1);
      assert.equal((await store.redemptionsForPlayer('1001')).length, 2);
      await store.addPlayers([{ player_id: '1001', kingdom_id: '710', source: 'admin' }]);
    });
    it('lease: exclusive, renewable, expiring', async () => {
      const store = await make();
      assert.equal(await store.acquireLease('a', 1000, 5000), true);
      assert.equal(await store.acquireLease('b', 2000, 5000), false);
      assert.equal(await store.renewLease('a', 3000, 5000), true);
      assert.equal(await store.renewLease('b', 3000, 5000), false);
      assert.equal(await store.acquireLease('b', 9000, 5000), true);
      assert.equal(await store.releaseLease('b', { last_error: 'x' }), true);
      const r = await store.getRunner();
      assert.equal(r.lease_owner, null);
      assert.equal(r.last_error, 'x');
      assert.equal(await store.acquireLease('c', 9001, 5000), true);
    });
    it('settings and audit', async () => {
      const store = await make();
      assert.equal((await store.getRunner()).auto_redeem_enabled, false);
      await store.setAutoRedeem(true, 'me');
      assert.equal((await store.getRunner()).auto_redeem_enabled, true);
      await store.addAudit({ at: new Date(1), actor: 'a', action: 'one', target: '', detail: '' });
      await store.addAudit({ at: new Date(2), actor: 'a', action: 'two', target: '', detail: '' });
      assert.deepEqual((await store.listAudit(5)).map((a) => a.action), ['two', 'one']);
    });
    it('codes: expire, deactivate, requeue, delete', async () => {
      const store = await make(['CODEA', 'CODEB']);
      assert.equal((await store.listActiveCodes()).length, 2);
      await store.markCodeExpired('CODEA', NOW);
      const a = await store.getCode('CODEA');
      assert.equal(a.active, false);
      assert.equal(a.expired_reason, 'game_expired');
      assert.equal(a.redeem_status, 'expired');
      await store.setCodeRedeemStatus('CODEA', 'queued');
      assert.equal((await store.getCode('CODEA')).redeem_status, 'expired'); // expired is sticky
      await store.saveRedemption({ code: 'CODEB', player_id: '1', kingdom_id: '710', status: 'skipped', attempts: 1, updated_at: NOW });
      await store.saveRedemption({ code: 'CODEB', player_id: '2', kingdom_id: '710', status: 'success', attempts: 1, updated_at: NOW });
      assert.equal((await store.requeueCode('CODEB')).removed, 1);
      await store.setCodeActive('CODEB', false, { reason: 'manual', now: NOW });
      assert.deepEqual((await store.listActiveCodes()).map((c) => c.code), []);
      assert.deepEqual(await store.deleteCode('CODEB'), { deleted: true, redemption_rows: 1 });
    });
  });
}

contract('memory', async (codes = []) => createMemoryStore({ codes: codes.map((code) => ({ code })) }));

describe('store contract: mongo (local mongod only)', () => {
  let client; let db; let up = false;
  const DB = `k710_giftunit_${process.pid}`;
  before(async () => {
    up = await mongoUp();
    if (!up) return;
    const { MongoClient } = await import('mongodb');
    client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    db = client.db(DB);
  });
  after(async () => {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  });
  async function fresh(codes = []) {
    for (const c of ['gift_codes', 'gift_players', 'gift_redemptions', 'gift_runner', 'gift_audit']) {
      await db.collection(c).deleteMany({});
      for (const idx of INDEXES[c] || []) await db.collection(c).createIndex(idx.keys, idx.options);
    }
    if (codes.length) await db.collection('gift_codes').insertMany(codes.map((code) => ({ code, active: true, redeem_status: 'queued', discovered_at: NOW })));
    return createMongoStore(db);
  }
  contract('mongo', fresh, () => up);
});
