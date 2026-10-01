// Re-throw Next.js control-flow errors that a broad `catch` must never swallow:
// DYNAMIC_SERVER_USAGE (a headers()/cookies() read during a static render),
// redirects / notFound / HTTP-fallback errors and prerender bailouts.
//
// This mirrors next/navigation's unstable_rethrow (digest checks) without
// importing it, because `next/navigation` cannot be loaded under plain Node
// (our node:test route tests import these libs). App-router pages and layouts
// can use the official `unstable_rethrow` from 'next/navigation' directly.
const NEXT_DIGESTS = [
  'DYNAMIC_SERVER_USAGE',
  'NEXT_REDIRECT',
  'NEXT_NOT_FOUND',
  'NEXT_HTTP_ERROR_FALLBACK',
  'NEXT_PRERENDER_INTERRUPTED',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
  'HANGING_PROMISE_REJECTION',
];

export function isNextControlFlowError(error) {
  const digest = typeof error?.digest === 'string' ? error.digest : '';
  if (digest && NEXT_DIGESTS.some((d) => digest === d || digest.startsWith(`${d};`))) return true;
  if (error?.name === 'HangingPromiseRejectionError') return true;
  if (error instanceof Error && 'cause' in error && error.cause) return isNextControlFlowError(error.cause);
  return false;
}

export function unstable_rethrow(error) {
  if (isNextControlFlowError(error)) throw error;
}
