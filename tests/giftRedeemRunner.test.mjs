import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_PAUSE_EVERY, BULK_PAUSE_MS, DEFAULT_DELAY_MS, MAX_RETRIES, REAL_GIFT_ENDPOINT, REQUEST_HEADERS, RETRY_DELAY_MS, STATUS_MAP,
} from '../lib/giftRedeem/constants.mjs';
import { appendSign, signingBase } from '../lib/giftRedeem/sign.mjs';
import { createRedeemClient } from '../lib/giftRedeem/client.mjs';
import { redeemPlayer, runPending } from '../lib/giftRedeem/runner.mjs';
import { createMemoryStore } from '../lib/giftRedeem/memoryStore.mjs';
import { redeemConfig } from '../lib/giftRedeem/config.mjs';
import { runRedeemOnce } from '../lib/giftRedeem/run.mjs';

const DUMMY_SECRET = 'test-secret'; // never the real one

/** Fake time: sleep() advances the clock and records every requested delay. */
function fakeTime() {
  const t = { now: 1_700_000_000_000, sleeps: [] };
  t.sleep = async (ms) => { t.sleeps.push(ms); t.now += ms; };
  t.clock = () => t.now;
  return t;
}

/** `redeem` stub: scripted err_codes per fid (array = one per attempt, last one repeats). */
function scriptedRedeem(script, calls = []) {
  return async (fid, kid, cdk) => {
    calls.push({ fid, kid, cdk });
    const seq = script[fid] ?? [20000];
    const n = calls.filter((c) => c.fid === fid && c.cdk === cdk).length;
    const err = seq[Math.min(n - 1, seq.length - 1)];
    if (err === 'throw') throw new Error('network down');
    return { ok: true, status: 200, data: { err_code: err, code: 1, msg: `m${err}` } };
  };
}

const player = (id, extra = {}) => ({ player_id: String(id), kingdom_id: '710', source: 'admin', enabled: true, ...extra });

async function setup({ codes = ['CODEA'], players = [1001], script = {}, budgetMs = 10_000_000 } = {}) {
  const store = createMemoryStore({ codes: codes.map((code) => ({ code })) });
  await store.addPlayers(players.map((p) => (typeof p === 'object' ? p : player(p))));
  const t = fakeTime();
  const calls = [];
  const run = () => runPending({ store, redeem: scriptedRedeem(script, calls), sleep: t.sleep, clock: t.clock, budgetMs, owner: 'test' });
  return { store, t, calls, run };
}

describe('constants mirror the bot', () => {
  it('has the bot pacing and status map', () => {
    assert.equal(DEFAULT_DELAY_MS, 800);
    assert.equal(RETRY_DELAY_MS, 3000);
    assert.equal(MAX_RETRIES, 5);
    assert.equal(BULK_PAUSE_EVERY, 15);
    assert.equal(BULK_PAUSE_MS, 5000);
    assert.deepEqual({ ...STATUS_MAP }, { 20000: 'success', 40001: 'login_failed', 40008: 'received', 40007: 'expired', 40017: 'recharge' });
    assert.equal(REAL_GIFT_ENDPOINT, 'https://kingshot-giftcode.centurygame.com/api/gift_code');
  });
});

describe('signing', () => {
  it('matches a hand-computed md5 vector (dummy secret)', () => {
    const payload = { fid: '1234', kid: '710', cdk: 'ABC', captcha_code: '', time: 1700000000 };
    assert.equal(signingBase(payload), 'captcha_code=&cdk=ABC&fid=1234&kid=710&time=1700000000');
    const signed = appendSign(payload, DUMMY_SECRET);
    // printf 'captcha_code=&cdk=ABC&fid=1234&kid=710&time=1700000000test-secret' | openssl md5
    assert.equal(signed.sign, 'db58d278249ee81be5362b006d450e5f');
    assert.deepEqual(Object.keys(signed), ['sign', 'fid', 'kid', 'cdk', 'captcha_code', 'time']);
  });
  it('refuses to sign without a secret', () => {
    assert.throws(() => appendSign({ a: 1 }, ''), /not configured/);
  });
});

describe('client', () => {
  it('posts a form-encoded signed body with the bot headers and never sends the secret', async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, text: async () => '{"err_code":20000}' };
    };
    const redeem = createRedeemClient({ secret: DUMMY_SECRET, endpoint: 'http://mock.local/api', fetchImpl, nowMs: () => 1_700_000_000_999 });
    const res = await redeem('1234', '710', 'ABC');
    assert.equal(seen.url, 'http://mock.local/api');
    assert.equal(seen.init.method, 'POST');
    assert.deepEqual({ ...seen.init.headers }, { ...REQUEST_HEADERS });
    const params = new URLSearchParams(seen.init.body);
    assert.equal(params.get('sign'), 'db58d278249ee81be5362b006d450e5f');
    assert.equal(params.get('time'), '1700000000');
    assert.equal(params.get('captcha_code'), '');
    assert.ok(!seen.init.body.includes(DUMMY_SECRET));
    assert.equal(res.data.err_code, 20000);
  });
  it('keeps non-JSON answers as raw text', async () => {
    const redeem = createRedeemClient({ secret: DUMMY_SECRET, endpoint: 'x', fetchImpl: async () => ({ ok: false, status: 502, text: async () => '<html>' }) });
    assert.deepEqual((await redeem('1', '2', '3')).data, { raw: '<html>' });
  });
});

describe('redeemPlayer loop semantics', () => {
  const go = async (script) => {
    const t = fakeTime();
    const calls = [];
    const r = await redeemPlayer({ fid: '1001', kid: '710', code: 'C', redeem: scriptedRedeem({ 1001: script }, calls), sleep: t.sleep });
    return { r, t, calls };
  };
  it('success finishes after one attempt with no sleep', async () => {
    const { r, t } = await go([20000]);
    assert.equal(r.status, 'success');
    assert.equal(r.attempts, 1);
    assert.deepEqual(t.sleeps, []);
  });
  it('received finishes', async () => {
    assert.equal((await go([40008])).r.status, 'received');
  });
  it('unknown retries 5 times with 3000ms between and stays unknown', async () => {
    const { r, t, calls } = await go([99999]);
    assert.equal(r.status, 'unknown');
    assert.equal(calls.length, 5);
    assert.deepEqual(t.sleeps, [3000, 3000, 3000, 3000]);
  });
  it('a later success after retries is kept', async () => {
    const { r, t } = await go([99999, 99999, 20000]);
    assert.equal(r.status, 'success');
    assert.equal(r.attempts, 3);
    assert.deepEqual(t.sleeps, [3000, 3000]);
  });
  it('login_failed is retried like the bot, then final', async () => {
    const { r, calls, t } = await go([40001]);
    assert.equal(r.status, 'login_failed');
    assert.equal(calls.length, 5);
    assert.equal(t.sleeps.length, 4);
  });
  it('recharge becomes skipped without retry', async () => {
    const { r, calls, t } = await go([40017]);
    assert.equal(r.status, 'skipped');
    assert.equal(calls.length, 1);
    assert.deepEqual(t.sleeps, []);
  });
  it('expired finishes immediately', async () => {
    const { r, calls } = await go([40007]);
    assert.equal(r.status, 'expired');
    assert.equal(calls.length, 1);
  });
  it('a thrown error is skipped without retry', async () => {
    const { r, calls } = await go(['throw']);
    assert.equal(r.status, 'skipped');
    assert.equal(calls.length, 1);
    assert.match(r.error, /network down/);
  });
});

describe('runPending pacing', () => {
  it('sleeps 800ms after every player including the last', async () => {
    const { run, t } = await setup({ players: [1001, 1002, 1003] });
    await run();
    assert.deepEqual(t.sleeps, [800, 800, 800]);
  });
  it('adds a 5000ms pause after every 15th player', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => 2000 + i);
    const { run, t } = await setup({ players: ids });
    await run();
    const expected = [];
    for (let i = 1; i <= 31; i += 1) {
      expected.push(800);
      if (i % 15 === 0) expected.push(5000);
    }
    assert.deepEqual(t.sleeps, expected);
    assert.equal(t.sleeps.filter((s) => s === 5000).length, 2);
  });
  it('a resumed code keeps the every-15th rhythm (players finished earlier count)', async () => {
    const ids = Array.from({ length: 17 }, (_, i) => 4000 + i);
    const { run, store, t } = await setup({ players: ids });
    for (const id of ids.slice(0, 14)) await store.saveRedemption({ code: 'CODEA', player_id: String(id), kingdom_id: '710', status: 'success', attempts: 1, updated_at: new Date() });
    await run();
    assert.deepEqual(t.sleeps, [800, 5000, 800, 800]);
  });
  it('retry sleeps come before the 800ms player delay', async () => {
    const { run, t } = await setup({ players: [1001], script: { 1001: [99999, 20000] } });
    await run();
    assert.deepEqual(t.sleeps, [3000, 800]);
  });
  it('never uses a delay below the bot values', async () => {
    const { run, t } = await setup({ players: [1001, 1002], script: { 1001: [99999, 99999, 40008], 1002: [40001] } });
    await run();
    for (const s of t.sleeps) assert.ok([800, 3000, 5000].includes(s));
  });
});

describe('runPending outcomes', () => {
  it('stores one final row per player and marks the code done', async () => {
    const { run, store } = await setup({ players: [1001, 1002], script: { 1002: [40008] } });
    const res = await run();
    assert.equal(res.totals.processed, 2);
    assert.deepEqual(await store.countsByCode(), { CODEA: { success: 1, received: 1 } });
    assert.equal((await store.getCode('CODEA')).redeem_status, 'done');
    assert.equal(res.workLeft, false);
  });
  it('expired stops the rest of that code, switches it off, and moves on to the next code', async () => {
    const { run, store, calls } = await setup({ codes: ['CODEA', 'CODEB'], players: [1001, 1002, 1003], script: { 1001: [40007] } });
    // CODEA: player 1001 says expired -> 1002/1003 never tried for CODEA. CODEB: expired answer applies to 1001 again, scripted per fid+cdk.
    await run();
    const a = await store.getCode('CODEA');
    assert.equal(a.active, false);
    assert.equal(a.expired_reason, 'game_expired');
    assert.equal(a.redeem_status, 'expired');
    assert.equal(calls.filter((c) => c.cdk === 'CODEA').length, 1);
  });
  it('login_failed marks the player failed so later codes skip them', async () => {
    const { run, store, calls } = await setup({ codes: ['CODEA', 'CODEB'], players: [1001, 1002], script: { 1001: [40001] } });
    const res = await run();
    assert.equal((await store.getPlayer('1001')).failed, true);
    assert.equal(calls.filter((c) => c.fid === '1001' && c.cdk === 'CODEB').length, 0);
    assert.equal(calls.filter((c) => c.fid === '1002' && c.cdk === 'CODEB').length, 1);
    assert.equal(res.totals.login_failed, 1);
  });
  it('recharge counts as skipped', async () => {
    const { run, store } = await setup({ players: [1001], script: { 1001: [40017] } });
    await run();
    assert.deepEqual(await store.countsByCode(), { CODEA: { skipped: 1 } });
  });
  it('never touches codes that are switched off or expired', async () => {
    const { run, store, calls } = await setup({ codes: ['CODEA', 'CODEB'], players: [1001] });
    await store.setCodeActive('CODEB', false);
    await run();
    assert.deepEqual([...new Set(calls.map((c) => c.cdk))], ['CODEA']);
  });
});

describe('consent', () => {
  it('skips disabled and failed players', async () => {
    const { run, calls } = await setup({
      players: [player(1001), player(1002, { enabled: false }), player(1003, { failed: true }), player(1004, { source: 'member', member_id: '1004' })],
    });
    await run();
    assert.deepEqual(calls.map((c) => c.fid).sort(), ['1001', '1004']);
  });
  it('a player enabled later is picked up for already-processed codes', async () => {
    const { run, store, calls } = await setup({ players: [1001, player(1002, { enabled: false })] });
    await run();
    await store.setPlayerEnabled('1002', true);
    await run();
    assert.equal(calls.filter((c) => c.fid === '1002').length, 1);
    assert.equal(calls.filter((c) => c.fid === '1001').length, 1); // not redeemed twice
  });
});

describe('resumability', () => {
  it('stops inside the budget, then the next run finishes without re-redeeming anyone', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => 3000 + i);
    const { store, t, calls } = await setup({ players: ids });
    // 800ms per player: budget 2400 lets exactly 3 players start (clock 0, 800, 1600 < 2400).
    const first = await runPending({ store, redeem: scriptedRedeem({}, calls), sleep: t.sleep, clock: t.clock, budgetMs: 2400, owner: 'a' });
    assert.equal(first.totals.processed, 3);
    assert.equal(first.outOfBudget, true);
    assert.equal(first.workLeft, true);
    assert.equal((await store.getCode('CODEA')).redeem_status, 'queued');
    const second = await runPending({ store, redeem: scriptedRedeem({}, calls), sleep: t.sleep, clock: t.clock, budgetMs: 10_000_000, owner: 'b' });
    assert.equal(second.totals.processed, 5);
    assert.equal(second.workLeft, false);
    const perFid = new Map();
    for (const c of calls) perFid.set(c.fid, (perFid.get(c.fid) || 0) + 1);
    assert.equal(perFid.size, 8);
    assert.ok([...perFid.values()].every((n) => n === 1));
    assert.equal((await store.getCode('CODEA')).redeem_status, 'done');
  });
  it('a run killed mid-way (rows saved, lease left) resumes after the lease expires', async () => {
    const { store, t, calls } = await setup({ players: [1001, 1002, 1003] });
    await store.saveRedemption({ code: 'CODEA', player_id: '1001', kingdom_id: '710', status: 'success', attempts: 1, updated_at: new Date() });
    await store.acquireLease('dead-run', t.now, 60_000); // crashed instance never released
    const blocked = await runPending({ store, redeem: scriptedRedeem({}, calls), sleep: t.sleep, clock: t.clock, budgetMs: 10_000, owner: 'new' });
    assert.equal(blocked.ran, false);
    t.now += 61_000;
    const res = await runPending({ store, redeem: scriptedRedeem({}, calls), sleep: t.sleep, clock: t.clock, budgetMs: 10_000, owner: 'new' });
    assert.equal(res.ran, true);
    assert.deepEqual(calls.map((c) => c.fid).sort(), ['1002', '1003']);
  });
});

describe('lease', () => {
  it('only one owner at a time, renewable, releasable', async () => {
    const store = createMemoryStore();
    assert.equal(await store.acquireLease('a', 1000, 5000), true);
    assert.equal(await store.acquireLease('b', 2000, 5000), false);
    assert.equal(await store.renewLease('a', 3000, 5000), true);
    assert.equal(await store.acquireLease('b', 7000, 5000), false); // renewed to 8000
    assert.equal(await store.acquireLease('b', 8001, 5000), true); // expired
    assert.equal(await store.releaseLease('a'), false);
    assert.equal(await store.releaseLease('b'), true);
    assert.equal(await store.acquireLease('c', 8002, 5000), true);
  });
  it('runPending releases the lease and records the finish time even after an error', async () => {
    const { store, t } = await setup({ players: [1001] });
    const boom = new Error('db down');
    store.saveRedemption = async () => { throw boom; };
    const res = await runPending({ store, redeem: scriptedRedeem({}), sleep: t.sleep, clock: t.clock, budgetMs: 10_000, owner: 'x' });
    assert.equal(res.ok, false);
    const runner = await store.getRunner();
    assert.equal(runner.lease_owner, null);
    assert.match(runner.last_error, /db down/);
  });
  it('two overlapping invocations: the second does nothing', async () => {
    const { store, t } = await setup({ players: [1001] });
    await store.acquireLease('first', t.now, 600_000);
    const res = await runPending({ store, redeem: scriptedRedeem({}), sleep: t.sleep, clock: t.clock, budgetMs: 10_000, owner: 'second' });
    assert.deepEqual(res, { ok: true, ran: false, reason: 'busy' });
  });
});

describe('switch and secret', () => {
  it('runRedeemOnce does nothing without the secret, even when forced', async () => {
    const { store } = await setup();
    assert.deepEqual(await runRedeemOnce(store, { env: {}, force: true }), { ok: true, ran: false, reason: 'no_secret' });
  });
  it('does nothing while the switch is off, runs when it is on, and force overrides the switch', async () => {
    const { store, t } = await setup({ players: [1001] });
    const env = { GIFT_REDEEM_SIGN_SECRET: DUMMY_SECRET, GIFT_REDEEM_ENDPOINT: 'http://mock.local/x' };
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, body: init.body }); return { ok: true, status: 200, text: async () => '{"err_code":20000}' }; };
    assert.equal((await runRedeemOnce(store, { env, fetchImpl, sleep: t.sleep, clock: t.clock })).reason, 'switched_off');
    assert.equal(calls.length, 0);
    await store.setAutoRedeem(true, 'test');
    const res = await runRedeemOnce(store, { env, fetchImpl, sleep: t.sleep, clock: t.clock, log: () => {} });
    assert.equal(res.ran, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://mock.local/x');
  });
  it('config clamps the budget and defaults the endpoint to the real one', () => {
    assert.equal(redeemConfig({}).budgetMs, 200_000);
    assert.equal(redeemConfig({ GIFT_REDEEM_BUDGET_MS: '5' }).budgetMs, 10_000);
    assert.equal(redeemConfig({ GIFT_REDEEM_BUDGET_MS: '99999999' }).budgetMs, 780_000);
    assert.equal(redeemConfig({}).endpoint, REAL_GIFT_ENDPOINT);
    assert.equal(redeemConfig({}).secretPresent, false);
    assert.equal(redeemConfig({ GIFT_REDEEM_SIGN_SECRET: 'x' }).secretPresent, true);
  });
});
