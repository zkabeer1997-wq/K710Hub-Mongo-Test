// Seeds the first ten 710 Lore stories (no photos: add those in Admin > Content > Lore).
//
//   node --env-file=.env.local scripts/seed-lore.mjs --i-know-this-is-not-local     # the database in MONGODB_URI
//   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710hub node scripts/seed-lore.mjs   # a local mongod, no flag needed
//
// Safe to run again: stories are matched by number and an existing story is left exactly as it is (so edits made in
// the admin panel are never overwritten). Add --overwrite to reset the title and text of the ten stories to the
// versions below; photos and the published switch are never touched.
// It only ever writes to the database named by MONGODB_URI / MONGODB_DB_NAME, and refuses anything that is not a
// local mongod (127.0.0.1 / localhost) unless --i-know-this-is-not-local is given.
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import { STORIES, seedLore } from '../lib/loreSeed.mjs';

export { STORIES, seedLore };

export const NOT_LOCAL_FLAG = '--i-know-this-is-not-local';

/** True for a plain `mongodb://` URI whose every host is 127.0.0.1 or localhost (never mongodb+srv / Atlas). */
export function isLocalMongoUri(uri) {
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/.exec(String(uri || ''));
  if (!m) return false;
  return m[1].split(',').every((host) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host));
}

/** Throws unless the target is local or the explicit flag was given. */
export function assertSafeTarget(uri, argv = []) {
  if (!uri) throw new Error('MONGODB_URI is not set. Nothing was written.');
  if (isLocalMongoUri(uri) || argv.includes(NOT_LOCAL_FLAG)) return;
  throw new Error(`Refusing to seed a MongoDB that is not a local mongod. Re-run with ${NOT_LOCAL_FLAG} if you really mean to write to it. Nothing was written.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  assertSafeTarget(uri, argv);
  const dbName = process.env.MONGODB_DB_NAME || 'k710hub';
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const result = await seedLore({ coll: client.db(dbName).collection('lore_stories'), overwrite: argv.includes('--overwrite') });
    console.log(`Lore seed done in database "${dbName}": ${result.inserted} added, ${result.updated} reset, ${result.kept} already there and left as they are.`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
