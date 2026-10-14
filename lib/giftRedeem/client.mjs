// One signed redeem request, ported from the bot's redeemGiftcode()/postSigned().
import { REQUEST_HEADERS, REQUEST_TIMEOUT_MS } from './constants.mjs';
import { appendSign } from './sign.mjs';

/**
 * Builds the function the runner calls for every attempt: (fid, kid, cdk) => { ok, status, data }.
 * `fetchImpl` is injected so tests and QA never touch the real service.
 */
export function createRedeemClient({ secret, endpoint, fetchImpl = globalThis.fetch, nowMs = () => Date.now(), timeoutMs = REQUEST_TIMEOUT_MS }) {
  return async function redeemGiftcode(fid, kid, cdk, captchaCode = '') {
    const payload = appendSign(
      { fid, kid, cdk, captcha_code: captchaCode, time: Math.trunc(nowMs() / 1000) },
      secret,
    );
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: REQUEST_HEADERS,
      cache: 'no-store',
      body: new URLSearchParams(payload).toString(),
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }
    return { ok: res.ok, status: res.status, data };
  };
}
