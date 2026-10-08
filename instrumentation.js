// Runs once per server process (Next calls register() on boot). Applies the
// index definitions from lib/mongoCollections.js so a fresh deploy never runs
// without its unique/TTL indexes. Strictly non-fatal: a failure (Mongo down,
// historic duplicates blocking a unique index) is logged and the app still
// starts. Skipped in tests, QA runs without a database, and the edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'test' || process.env.QA_NO_DB === '1') return;
  if (!(process.env.MONGODB_URI || process.env.MONGO_URI)) return;
  if (globalThis.__k710IndexesEnsured) return;
  globalThis.__k710IndexesEnsured = true;

  try {
    const { ensureIndexes } = await import('./lib/mongo.js');
    const failures = await ensureIndexes();
    for (const f of failures) {
      console.error(`[indexes] ${f.collection}.${f.name} failed: ${f.message}`);
    }
  } catch (error) {
    console.error('[indexes] ensureIndexes could not run:', error?.message || error);
  }
}
