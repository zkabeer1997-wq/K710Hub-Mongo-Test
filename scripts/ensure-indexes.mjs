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
  await ensureIndexes();
  console.log('Indexes applied.');
} catch (error) {
  console.error('ensureIndexes failed:', error);
  process.exitCode = 1;
} finally {
  const client = await getMongoClient();
  await client.close();
}
