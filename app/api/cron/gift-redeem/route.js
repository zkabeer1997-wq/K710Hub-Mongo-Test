import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getDb } from '../../../../lib/mongo';
import { createMongoStore } from '../../../../lib/giftRedeem/mongoStore.mjs';
import { runAndChain, selfOrigin } from '../../../../lib/giftRedeem/run.mjs';
import { runInBackground } from '../../../../lib/giftRedeem/background.js';

// One invocation works inside GIFT_REDEEM_BUDGET_MS (default 200 s) and then ends cleanly; the next
// invocation (chained below, the cron safety net, or the admin "Process now" button) resumes.
// 300 s is the longest a function may run on Vercel Hobby/Pro with Fluid Compute (the default).
export const maxDuration = 300;

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function sameOriginOk(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * Redeem tick. Auth: `Authorization: Bearer CRON_SECRET` (Vercel Cron and our own chaining)
 * OR an admin session (the "Process now / Resume" button, same-origin only).
 *   ?mode=async  answer 202 at once and work in after() (used for chaining and the button)
 *   ?depth=N     chain depth, capped in lib/giftRedeem/constants.mjs
 */
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret) && (request.headers.get('authorization') || '') === `Bearer ${cronSecret}`;
  const isAdmin = !isCron && sameOriginOk(request) && (await isAdminRequest(request));
  if (!isCron && !isAdmin) return noStoreJson({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const depth = Math.max(0, Math.trunc(Number(url.searchParams.get('depth'))) || 0);
  const origin = selfOrigin(request);
  try {
    const store = createMongoStore(await getDb());
    if (url.searchParams.get('mode') === 'async') {
      runInBackground(() => runAndChain({ origin, depth, store }));
      return noStoreJson({ ok: true, accepted: true }, { status: 202 });
    }
    const result = await runAndChain({ origin, depth, store });
    return noStoreJson(result);
  } catch (error) {
    console.error('gift-redeem run failed', error?.message || error);
    return noStoreJson({ error: 'Run failed' }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
