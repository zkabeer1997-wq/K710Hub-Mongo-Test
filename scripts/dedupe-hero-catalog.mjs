/**
 * One-time cleanup of duplicate rows in the hero_catalog collection (the same hero saved twice by racing lazy seeds).
 * Keeps the best row of each normalised name (has an image, then active, then oldest), merges the image onto it,
 * backfills name_norm. Never touches members' saved hero names or any other collection.
 *
 * Usage:
 *   MONGODB_URI=... node scripts/dedupe-hero-catalog.mjs          dry run: prints what would change
 *   MONGODB_URI=... node scripts/dedupe-hero-catalog.mjs --yes    applies it
 * MONGODB_DB_NAME overrides the database name (default k710hub). The URI must be given explicitly.
 */
import { MongoClient } from 'mongodb';
import { dedupeHeroCollection } from '../lib/heroCatalog.mjs';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Set MONGODB_URI explicitly (this script never reads .env files).');
  process.exit(1);
}
const apply = process.argv.includes('--yes');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'k710hub');
  const summary = await dedupeHeroCollection(db.collection('hero_catalog'), { apply });
  console.log(JSON.stringify({ database: db.databaseName, mode: apply ? 'APPLIED' : 'DRY RUN (add --yes to apply)', ...summary }, null, 2));
} catch (error) {
  console.error('dedupe failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  await client.close();
}
