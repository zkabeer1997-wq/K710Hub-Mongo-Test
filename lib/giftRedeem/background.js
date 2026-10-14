import { after } from 'next/server';

/**
 * Runs `fn` after the response has been sent (Next.js `after`). Outside a request scope - for
 * example in unit tests that call a route handler directly - `after` throws; then nothing runs.
 */
export function runInBackground(fn) {
  try {
    after(async () => {
      try {
        await fn();
      } catch (error) {
        console.error('[gift-redeem] background task failed:', error?.message || error);
      }
    });
    return true;
  } catch {
    return false;
  }
}
