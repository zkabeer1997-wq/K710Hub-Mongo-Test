import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryStore } from '../lib/giftRedeem/memoryStore.mjs';
import {
  adminOverview, applyAdminAction, bucketTotals, memberStatus, setMemberOptIn,
} from '../lib/giftRedeem/service.mjs';
import { normalizeKingdom, normalizePlayerId, parseBotImport, parsePlayerLines } from '../lib/giftRedeem/players.mjs';

const ENV = { GIFT_REDEEM_SIGN_SECRET: 'dummy' };
const NOW = new Date('2026-10-14T10:00:00Z');
const act = (store, action, body, env = ENV) => applyAdminAction(store, action, body, { actor: 'tester', env, now: NOW });

describe('validation', () => {
  it('player ids are 4 to 20 digits, kingdoms 1 to 4 digits', () => {
    assert.equal(normalizePlayerId('1234'), '1234');
    assert.equal(normalizePlayerId(' 12345678901234567890 '), '12345678901234567890');
    for (const bad of ['123', '123456789012345678901', '12a4', '', null, '12 34']) assert.equal(normalizePlayerId(bad), null);
    assert.equal(normalizeKingdom('710'), '710');
    assert.equal(normalizeKingdom('0007'), '7');
    for (const bad of ['0', '12345', 'x', '', null]) assert.equal(normalizeKingdom(bad), null);
  });
  it('bulk paste: one "ID kingdom" per line, bad lines reported, duplicates dropped', () => {
    const r = parsePlayerLines('1001 710\n1002,710\n\n1001 710\nabc 710\n1003\n1004 99999\n1005\t523');
    assert.deepEqual(r.valid, [
      { player_id: '1001', kingdom_id: '710' }, { player_id: '1002', kingdom_id: '710' }, { player_id: '1005', kingdom_id: '523' },
    ]);
    assert.equal(r.rejected.length, 3);
  });
});

describe('bot import parsing', () => {
  it('reads player_ids.json (with failed + kingdoms)', () => {
    const r = parseBotImport({
      playerIds: ['1001', '1002', '1003', 'bad'],
      failedPlayerIds: ['1002', '1009'],
      kingdomByPlayerId: { 1001: '710', 1002: '523', 1009: '710' },
    });
    assert.equal(r.kind, 'player_ids');
    assert.deepEqual(r.players.map((p) => [p.player_id, p.kingdom_id, p.failed]), [['1001', '710', false], ['1002', '523', true], ['1009', '710', true]]);
    assert.equal(r.skipped_no_kingdom, 1); // 1003 has no kingdom
    assert.equal(r.invalid, 1);
  });
  it('reads player_submissions.json', () => {
    const r = parseBotImport({ userPlayerIds: { d1: { playerId: '2001', kingdom: 710 }, d2: { playerId: '2001', kingdom: '710' }, d3: { playerId: '2002' } } });
    assert.equal(r.kind, 'player_submissions');
    assert.equal(r.players.length, 1);
    assert.equal(r.duplicates, 1);
    assert.equal(r.skipped_no_kingdom, 1);
  });
  it('recognises nothing else', () => {
    assert.equal(parseBotImport({ hello: 1 }).kind, 'unknown');
    assert.equal(parseBotImport(null).kind, 'unknown');
    assert.equal(parseBotImport([1, 2]).players.length, 0);
  });
});

describe('admin actions', () => {
  it('add_players validates, dedupes, and does not duplicate already enrolled players', async () => {
    const store = createMemoryStore();
    const first = await act(store, 'add_players', { text: '1001 710\n1002 710\nzzz 710' });
    assert.equal(first.status, 200);
    assert.equal(first.body.added, 2);
    assert.equal(first.body.rejected.length, 1);
    const again = await act(store, 'add_players', { text: '1001 710\n1003 523' });
    assert.equal(again.body.added, 1);
    assert.equal(again.body.existing, 1);
    assert.equal((await store.listPlayers()).total, 3);
    assert.equal((await act(store, 'add_players', { text: 'nope' })).status, 400);
    assert.equal((await act(store, 'add_players', { players: Array.from({ length: 1001 }, (_, i) => ({ player_id: String(10000 + i), kingdom_id: '710' })) })).status, 400);
  });
  it('import marks rows bot_import, keeps the failed flag, ignores bad rows', async () => {
    const store = createMemoryStore();
    const r = await act(store, 'import_players', { players: [{ player_id: '1001', kingdom_id: '710' }, { player_id: '1002', kingdom_id: '523', failed: true }, { player_id: 'x', kingdom_id: '1' }] });
    assert.equal(r.body.added, 2);
    assert.equal(r.body.invalid, 1);
    const p = await store.getPlayer('1002');
    assert.equal(p.source, 'bot_import');
    assert.equal(p.failed, true);
    assert.equal((await act(store, 'import_players', { players: [] })).status, 400);
  });
  it('enable/disable/remove/re-enable work and are audited', async () => {
    const store = createMemoryStore();
    await act(store, 'add_players', { text: '1001 710' });
    await store.markPlayerFailed('1001');
    assert.equal((await act(store, 'set_player_enabled', { player_id: '1001', enabled: false })).status, 200);
    assert.equal((await store.getPlayer('1001')).enabled, false);
    assert.equal((await act(store, 'reenable_player', { player_id: '1001' })).status, 200);
    const p = await store.getPlayer('1001');
    assert.equal(p.failed, false);
    assert.equal(p.enabled, true);
    assert.equal((await act(store, 'remove_player', { player_id: '1001' })).status, 200);
    assert.equal((await act(store, 'remove_player', { player_id: '1001' })).status, 404);
    assert.equal((await act(store, 'remove_player', { player_id: 'bad' })).status, 400);
    const audit = await store.listAudit(20);
    assert.deepEqual(audit.map((a) => a.action).reverse(), ['add_players', 'disable_player', 'reenable_player', 'remove_player']);
    assert.ok(audit.every((a) => a.actor === 'tester'));
  });
  it('the switch cannot be turned on without the secret, and is audited when it is', async () => {
    const store = createMemoryStore();
    assert.equal((await act(store, 'set_auto_redeem', { enabled: true }, {})).status, 400);
    assert.equal((await store.getRunner()).auto_redeem_enabled, false);
    assert.equal((await act(store, 'set_auto_redeem', { enabled: true })).status, 200);
    assert.equal((await store.getRunner()).auto_redeem_enabled, true);
    assert.equal((await act(store, 'set_auto_redeem', { enabled: false }, {})).status, 200); // off always allowed
    assert.deepEqual((await store.listAudit(5)).map((a) => a.action), ['auto_redeem_off', 'auto_redeem_on']);
  });
  it('code actions: disable, enable, delete (removes results), reprocess retries only skipped/unknown', async () => {
    const store = createMemoryStore({ codes: [{ code: 'CODEA' }] });
    for (const [pid, status] of [['1001', 'success'], ['1002', 'skipped'], ['1003', 'unknown']]) {
      await store.saveRedemption({ code: 'CODEA', player_id: pid, kingdom_id: '710', status, attempts: 1, updated_at: NOW });
    }
    assert.equal((await act(store, 'reprocess_code', { code: 'CODEA' })).body.removed, 2);
    assert.deepEqual(await store.countsByCode(), { CODEA: { success: 1 } });
    await act(store, 'set_code_active', { code: 'CODEA', active: false });
    assert.equal((await act(store, 'reprocess_code', { code: 'CODEA' })).status, 400);
    assert.equal((await store.getCode('CODEA')).redeem_status, 'paused');
    await act(store, 'set_code_active', { code: 'CODEA', active: true });
    assert.equal((await store.getCode('CODEA')).redeem_status, 'queued');
    const del = await act(store, 'delete_code', { code: 'CODEA' });
    assert.equal(del.body.redemption_rows, 1);
    assert.equal(await store.getCode('CODEA'), null);
    assert.equal((await act(store, 'delete_code', { code: 'CODEA' })).status, 404);
    assert.equal((await act(store, 'bogus', {})).status, 400);
  });
});

describe('member side', () => {
  it('opt-in uses the session id and kingdom 710 only; opt-out disables', async () => {
    const store = createMemoryStore({ codes: [{ code: 'CODEA' }] });
    assert.equal((await setMemberOptIn(store, 'not-a-number', true)).ok, false);
    assert.equal((await setMemberOptIn(store, '920000001', true)).ok, true);
    const p = await store.getPlayer('920000001');
    assert.equal(p.kingdom_id, '710');
    assert.equal(p.source, 'member');
    assert.equal(p.member_id, '920000001');
    assert.equal((await store.listRunnablePlayers()).length, 1);
    await setMemberOptIn(store, '920000001', false);
    assert.equal((await store.listRunnablePlayers()).length, 0);
    assert.equal((await store.getPlayer('920000001')).enabled, false);
  });
  it('status shows only my own result per code and nothing about other players', async () => {
    const store = createMemoryStore({ codes: [{ code: 'CODEA' }, { code: 'CODEB' }, { code: 'CODEC' }, { code: 'CODED' }] });
    await setMemberOptIn(store, '920000001', true);
    await setMemberOptIn(store, '920000002', true);
    const row = (code, player_id, status) => store.saveRedemption({ code, player_id, kingdom_id: '710', status, attempts: 1, updated_at: NOW });
    await row('CODEA', '920000001', 'success');
    await row('CODEB', '920000001', 'received');
    await row('CODEC', '920000001', 'login_failed');
    await row('CODEA', '920000002', 'expired');
    const mine = await memberStatus(store, '920000001', { env: ENV });
    assert.deepEqual(mine.codes.map((c) => [c.code, c.result]), [['CODEA', 'redeemed'], ['CODEB', 'already_had'], ['CODEC', 'problem'], ['CODED', 'waiting']]);
    assert.equal(mine.playerId, '920000001');
    const text = JSON.stringify(mine);
    assert.ok(!text.includes('920000002'));
    assert.ok(!/err_code|attempts|msg/.test(text));
    const nobody = await memberStatus(store, '555555', { env: ENV });
    assert.equal(nobody.enabled, false);
    assert.ok(nobody.codes.every((c) => c.result === 'waiting'));
  });
  it('reports auto-redeem as unavailable while the switch is off', async () => {
    const store = createMemoryStore();
    assert.equal((await memberStatus(store, '1234', { env: ENV })).autoRedeemAvailable, false);
    await store.setAutoRedeem(true);
    assert.equal((await memberStatus(store, '1234', { env: ENV })).autoRedeemAvailable, true);
    assert.equal((await memberStatus(store, '1234', { env: {} })).autoRedeemAvailable, false);
  });
});

describe('admin overview', () => {
  it('counts per code and per bucket', async () => {
    const store = createMemoryStore({ codes: [{ code: 'CODEA' }] });
    await store.addPlayers([1001, 1002, 1003].map((id) => ({ player_id: String(id), kingdom_id: '710', source: 'admin' })));
    await store.saveRedemption({ code: 'CODEA', player_id: '1001', kingdom_id: '710', status: 'success', attempts: 1, updated_at: NOW });
    await store.saveRedemption({ code: 'CODEA', player_id: '1002', kingdom_id: '710', status: 'unknown', attempts: 5, updated_at: NOW });
    const o = await adminOverview(store, { env: ENV });
    assert.equal(o.counters.ready, 1);
    assert.equal(o.counters.redeemed, 1);
    assert.equal(o.counters.skipped, 1);
    assert.equal(o.codes[0].processed, 2);
    assert.equal(o.codes[0].total, 3);
    assert.equal(o.config.secret_present, true);
    assert.equal(o.runner.state, 'idle');
    assert.deepEqual(bucketTotals({ X: { success: 2, received: 1, login_failed: 1, expired: 1, skipped: 1, unknown: 1 } }), { redeemed: 2, already_had: 1, expired: 1, login_failed: 1, skipped: 2 });
    assert.ok(!JSON.stringify(o).includes('dummy'));
  });
});

describe('route guards (source check)', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('admin route checks isAdminRequest in GET and POST', () => {
    const src = read('app/api/admin-gift-codes/route.js');
    assert.equal((src.match(/isAdminRequest\(request\)/g) || []).length, 2);
  });
  it('member route reads the member session for every handler and never reads a player id from the body', () => {
    const src = read('app/api/gift-codes/route.js');
    assert.equal((src.match(/readMemberSession\(request\)/g) || []).length, 2);
    assert.ok(!/body\??\.(playerId|player_id|kingdom|memberId)/.test(src));
  });
  it('runner route accepts only CRON_SECRET bearer or an admin session and declares maxDuration', () => {
    const src = read('app/api/cron/gift-redeem/route.js');
    assert.match(src, /Bearer \$\{cronSecret\}/);
    assert.match(src, /isAdminRequest\(request\)/);
    assert.match(src, /export const maxDuration = 300/);
  });
  it('the secret value never appears in the repo sources', () => {
    for (const f of ['lib/giftRedeem/sign.mjs', 'lib/giftRedeem/constants.mjs', 'lib/giftRedeem/client.mjs', 'docs/gift-redeem.md']) {
      let src = '';
      try { src = read(f); } catch { continue; }
      assert.ok(!/SECRET\s*=\s*["']/.test(src), `${f} must not embed a secret`);
    }
  });
});
