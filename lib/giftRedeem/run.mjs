// Glue used by the cron/runner route: builds the redeem client from the environment, runs one
// budgeted invocation, and (optionally) asks for the next one.
import { randomUUID } from 'node:crypto';
import { MAX_CHAIN_DEPTH } from './constants.mjs';
import { redeemConfig } from './config.mjs';
import { createRedeemClient } from './client.mjs';
import { runPending } from './runner.mjs';
import { autoRedeemEffective } from './service.mjs';

export const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one budgeted invocation if (and only if) the switch is on and the secret is present.
 * `force` (admin "Process now") ignores the switch but still needs the secret.
 */
export async function runRedeemOnce(store, {
  env = process.env, fetchImpl = globalThis.fetch, sleep = realSleep, clock = () => Date.now(), force = false, log = (m) => console.log(`[gift-redeem] ${m}`),
} = {}) {
  const cfg = redeemConfig(env);
  if (!cfg.secretPresent) return { ok: true, ran: false, reason: 'no_secret' };
  const runner = await store.getRunner();
  if (!force && !autoRedeemEffective(runner, env)) return { ok: true, ran: false, reason: 'switched_off' };
  const redeem = createRedeemClient({ secret: String(env.GIFT_REDEEM_SIGN_SECRET).trim(), endpoint: cfg.endpoint, fetchImpl, nowMs: clock });
  return runPending({ store, redeem, sleep, clock, budgetMs: cfg.budgetMs, owner: randomUUID(), log });
}

/**
 * After a run that ran out of budget (or after discovery found new codes), start the next
 * invocation as a fresh serverless request. The target answers 202 immediately and does the work
 * in after(), so awaiting this call is cheap. Returns true when the next run was requested.
 */
export async function requestNextRun({ origin, depth = 0, env = process.env, fetchImpl = globalThis.fetch }) {
  const cronSecret = String(env.CRON_SECRET || '').trim();
  if (!cronSecret || !origin || depth >= MAX_CHAIN_DEPTH) return false;
  try {
    const res = await fetchImpl(`${origin}/api/cron/gift-redeem?mode=async&depth=${depth + 1}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch (error) {
    console.error('[gift-redeem] could not chain the next run:', error?.message || error);
    return false;
  }
}

/** Where to call ourselves. Prefers the incoming request's origin (same deployment). */
export function selfOrigin(request, env = process.env) {
  try {
    return new URL(request.url).origin;
  } catch {
    return String(env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || null;
  }
}

/** Runs one budgeted invocation and, if work is left, asks for the next one (never throws for run problems). */
export async function runAndChain({ store, origin, depth = 0, env = process.env, fetchImpl = globalThis.fetch, ...opts }) {
  const result = await runRedeemOnce(store, { env, fetchImpl, ...opts });
  if (result.ran && result.workLeft && !result.error) {
    await requestNextRun({ origin, depth, env, fetchImpl });
  }
  return result;
}
