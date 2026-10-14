// Gift code redeem loop, ported from the bot's runBulkRedeem() (src/kingshot.js) and the
// /giftcode command (src/commands/giftcode.js), made resumable for serverless.
//
// Everything with side effects is injected: `redeem` (signed request), `sleep`, `clock`, and the
// `store` (see store contract in memoryStore.mjs), so the pacing is unit-tested with a fake clock.
import {
  BULK_PAUSE_EVERY,
  BULK_PAUSE_MS,
  DEFAULT_DELAY_MS,
  LEASE_MARGIN_MS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  STATUS_MAP,
} from './constants.mjs';

/** Port of the per-player attempt loop. Returns the bot's itemResult plus `attempts`. */
export async function redeemPlayer({ fid, kid, code, redeem, sleep }) {
  let itemResult = { fid, status: 'skipped', err_code: null, code: null, msg: null };
  let attempts = 0;
  try {
    let attempt = 0;
    let finished = false;
    while (attempt < MAX_RETRIES && !finished) {
      attempt += 1;
      attempts = attempt;
      const redeemResult = await redeem(fid, kid, code);
      const errCode = Number(redeemResult.data?.err_code);
      const status = STATUS_MAP[errCode] || 'unknown';
      itemResult = {
        fid,
        status,
        err_code: redeemResult.data?.err_code ?? null,
        code: redeemResult.data?.code ?? null,
        msg: redeemResult.data?.msg ?? null,
      };
      if (status === 'success' || status === 'received') { finished = true; break; }
      if (status === 'expired') { finished = true; break; }
      if (status === 'recharge') { itemResult = { ...itemResult, status: 'skipped' }; break; }
      // unknown / login_failed: retry like the bot does
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  } catch (error) {
    itemResult = { fid, status: 'skipped', err_code: null, code: null, msg: null, error: String(error) };
  }
  if (
    itemResult.status !== 'success' && itemResult.status !== 'received' && itemResult.status !== 'expired'
    && itemResult.status !== 'unknown' && itemResult.status !== 'login_failed'
  ) {
    itemResult.status = 'skipped';
  }
  return { ...itemResult, attempts };
}

function trimMsg(msg) {
  if (msg === null || msg === undefined) return null;
  return String(msg).slice(0, 160);
}

/**
 * Process one code for the players that have no final row yet. Returns how it ended:
 * `done` (everyone handled), `expired` (game said expired: rest skipped), `budget` (out of time, resume later).
 */
export async function processCode({ store, code, players, redeem, sleep, clock, deadline, owner, leaseMs, log = () => {} }) {
  const summary = { total: 0 };
  let index = 0;
  let ended = 'done';
  await store.setCodeRedeemStatus(code, 'running');
  for (const player of players) {
    if (clock() >= deadline) { ended = 'budget'; break; }
    const fid = String(player.player_id);
    const kid = String(player.kingdom_id);
    const item = await redeemPlayer({ fid, kid, code, redeem, sleep });
    index += 1;
    summary.total += 1;
    summary[item.status] = (summary[item.status] || 0) + 1;
    // Same log fields as the bot: fid, status, err_code. Never the payload or signature.
    log(`[PLAYER DONE] fid=${fid} (${index}/${players.length}) status=${item.status} err_code=${item.err_code ?? '-'}`);
    // Checkpoint immediately: this row replaces the bot's processedPlayerIds.
    await store.saveRedemption({
      code,
      player_id: fid,
      kingdom_id: kid,
      status: item.status,
      err_code: item.err_code === null || item.err_code === undefined ? null : Number(item.err_code),
      attempts: item.attempts,
      msg: trimMsg(item.msg),
      updated_at: new Date(clock()),
    });
    if (item.status === 'login_failed') await store.markPlayerFailed(fid, new Date(clock()));
    if (item.status === 'expired') await store.markCodeExpired(code, new Date(clock()));
    await store.renewLease(owner, clock(), leaseMs);

    await sleep(DEFAULT_DELAY_MS);
    if (item.status === 'expired') { ended = 'expired'; break; } // expired globally: stop the rest of this code
    if (index % BULK_PAUSE_EVERY === 0) await sleep(BULK_PAUSE_MS);
  }
  if (ended === 'done') await store.setCodeRedeemStatus(code, 'done');
  else if (ended === 'budget') await store.setCodeRedeemStatus(code, 'queued');
  return { ended, summary };
}

export async function pendingPlayersForCode(store, code) {
  const [players, done] = await Promise.all([store.listRunnablePlayers(), store.finalPlayerIds(code)]);
  return players.filter((p) => !done.has(String(p.player_id)));
}

/** Work that still needs doing: [{ code, players }] for every active code that has runnable players without a final row. */
export async function collectPendingWork(store) {
  const [codes, players] = await Promise.all([store.listActiveCodes(), store.listRunnablePlayers()]);
  const work = [];
  for (const c of codes) {
    const done = await store.finalPlayerIds(c.code);
    const todo = players.filter((p) => !done.has(String(p.player_id)));
    if (todo.length) work.push({ code: c.code, players: todo });
  }
  return work;
}

export async function hasPendingWork(store) {
  return (await collectPendingWork(store)).length > 0;
}

/**
 * One invocation: take the lease, work through pending codes inside the wall-clock budget, release.
 * Safe to call repeatedly; resumes where the last call stopped.
 */
export async function runPending({
  store, redeem, sleep, clock = () => Date.now(), budgetMs, owner, log = () => {},
}) {
  const startedAt = clock();
  const leaseMs = budgetMs + LEASE_MARGIN_MS;
  const acquired = await store.acquireLease(owner, startedAt, leaseMs);
  if (!acquired) return { ok: true, ran: false, reason: 'busy' };
  const totals = { processed: 0 };
  const perCode = [];
  let outOfBudget = false;
  let lastError = null;
  try {
    await store.patchRunner({ last_started_at: new Date(startedAt), last_error: null, progress: null });
    const deadline = startedAt + budgetMs;
    const activeCodes = await store.listActiveCodes();
    for (const c of activeCodes) {
      if (clock() >= deadline) { outOfBudget = true; break; }
      // Recomputed per code, so a player marked failed (or an admin change) during this run is honoured by later codes.
      const current = await store.getCode(c.code);
      if (!current || current.active === false || current.redeem_status === 'expired') continue;
      const players = await pendingPlayersForCode(store, c.code);
      if (!players.length) { await store.setCodeRedeemStatus(c.code, 'done'); continue; }
      const job = { code: c.code, players };
      await store.patchRunner({ progress: { code: job.code, remaining: job.players.length } });
      const res = await processCode({ store, code: job.code, players: job.players, redeem, sleep, clock, deadline, owner, leaseMs, log });
      totals.processed += res.summary.total;
      for (const [k, v] of Object.entries(res.summary)) if (k !== 'total') totals[k] = (totals[k] || 0) + v;
      perCode.push({ code: job.code, ended: res.ended, ...res.summary });
      if (res.ended === 'budget') { outOfBudget = true; break; }
    }
  } catch (error) {
    lastError = String(error?.message || error).slice(0, 200);
    log(`[RUN FAILED] ${lastError}`);
  } finally {
    await store.releaseLease(owner, {
      last_finished_at: new Date(clock()),
      last_error: lastError,
      progress: null,
      last_summary: { ...totals, out_of_budget: outOfBudget },
    }).catch(() => {});
  }
  const workLeft = lastError ? false : await hasPendingWork(store).catch(() => false);
  return { ok: !lastError, ran: true, totals, perCode, outOfBudget, workLeft, error: lastError };
}
