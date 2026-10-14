import { DEFAULT_BUDGET_MS, MAX_BUDGET_MS, MIN_BUDGET_MS, REAL_GIFT_ENDPOINT } from './constants.mjs';

/** Reads the redeem environment. Never returns the secret value, only whether it is present. */
export function redeemConfig(env = process.env) {
  const budgetRaw = Number(env.GIFT_REDEEM_BUDGET_MS);
  const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
    ? Math.min(MAX_BUDGET_MS, Math.max(MIN_BUDGET_MS, Math.trunc(budgetRaw)))
    : DEFAULT_BUDGET_MS;
  // GIFT_REDEEM_ENDPOINT exists only so QA can point the runner at a local mock. Production leaves it unset.
  const endpoint = String(env.GIFT_REDEEM_ENDPOINT || '').trim() || REAL_GIFT_ENDPOINT;
  return {
    secretPresent: Boolean(String(env.GIFT_REDEEM_SIGN_SECRET || '').trim()),
    budgetMs,
    endpoint,
    endpointIsMock: endpoint !== REAL_GIFT_ENDPOINT,
    cronSecretPresent: Boolean(String(env.CRON_SECRET || '').trim()),
  };
}
