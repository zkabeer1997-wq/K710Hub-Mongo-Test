/**
 * Apply the index definitions in lib/mongoCollections.js to the live database.
 * Usage: MONGODB_URI=... [MONGODB_DB_NAME=...] npm run db:indexes
 * Safe to re-run: createIndex is idempotent for identical specs.
 *
 * Uses the mongodb driver directly (lib/mongo.js imports `server-only`, which
 * throws outside the Next.js bundler), mirroring ensureIndexes() in lib/mongo.js.
 */
import { MongoClient } from 'mongodb';
import { INDEXES } from '../lib/mongoCollections.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'k710hub');
  const failures = [];
  for (const [collName, specs] of Object.entries(INDEXES)) {
    for (const spec of specs) {
      try {
        await db.collection(collName).createIndex(spec.keys, spec.options || {});
      } catch (error) {
        failures.push({ collection: collName, name: spec.options?.name, message: error?.message || String(error) });
      }
    }
  }
  if (failures.length) {
    for (const f of failures) console.error(`FAILED ${f.collection}.${f.name}: ${f.message}`);
    console.error('Some indexes were not created (usually a unique index blocked by duplicate rows). Clean the duplicates, then re-run. See docs/AUDIT-2026-10.md.');
    process.exitCode = 1;
  } else {
    console.log('Indexes applied.');
  }
} catch (error) {
  console.error('ensure-indexes failed:', error);
  process.exitCode = 1;
} finally {
  await client.close();
}
