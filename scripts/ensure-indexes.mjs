/**
 * Apply the index definitions in lib/mongoCollections.js to the live database.
 * Usage: MONGODB_URI=... node scripts/ensure-indexes.mjs
 * Safe to re-run: createIndex is idempotent for identical specs.
 */
import { ensureIndexes, getMongoClient } from '../lib/mongo.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

try {
  const failures = await ensureIndexes();
  if (failures.length) {
    for (const f of failures) console.error(`FAILED ${f.collection}.${f.name}: ${f.message}`);
    console.error('Some indexes were not created (usually a unique index blocked by duplicate rows). Clean the duplicates, then re-run. See docs/AUDIT-2026-10.md.');
    process.exitCode = 1;
  } else {
    console.log('Indexes applied.');
  }
} catch (error) {
  console.error('ensureIndexes failed:', error);
  process.exitCode = 1;
} finally {
  const client = await getMongoClient();
  await client.close();
}
