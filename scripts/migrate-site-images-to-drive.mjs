#!/usr/bin/env node
/**
 * Move legacy base64 images from MongoDB to Google Drive (K710 Website folder tree):
 *   - guide builder images (guide_attachments)  -> Guides images
 *   - application screenshots (interest_submissions) -> Applications/<Player ID>
 * (Gallery rows: scripts/migrate-gallery-to-drive.mjs.)
 *
 *   MONGODB_URI=... MONGODB_DB_NAME=... MEMBER_SESSION_SECRET=... \
 *     GOOGLE_DRIVE_CLIENT_ID=... GOOGLE_DRIVE_CLIENT_SECRET=... \
 *     node scripts/migrate-site-images-to-drive.mjs [--yes]
 *
 * Dry run without --yes. Refuses to run without an explicit MONGODB_URI. Drive
 * must already be connected from Admin > Gallery. Idempotent: migrated rows are skipped.
 */
import { MongoClient } from 'mongodb';
import { createDriveClient } from '../lib/driveClient.mjs';
import { createMongoTokenStore } from '../lib/driveTokenStore.mjs';
import { createFolderTree } from '../lib/driveFolders.mjs';
import { guideLegacyFilter, migrateGuideBatch } from '../lib/guideImageStore.mjs';
import { WAITING_FILTER, migrateInterestBatch } from '../lib/interestScreenshots.mjs';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('Set MONGODB_URI explicitly (this script never reads .env files).'); process.exit(1); }
const yes = process.argv.includes('--yes');
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'k710hub');
  const guides = db.collection('guide_attachments');
  const apps = db.collection('interest_submissions');
  const counts = { guideImages: await guides.countDocuments(guideLegacyFilter()), applications: await apps.countDocuments(WAITING_FILTER) };
  console.log(`Database: ${db.databaseName}. Legacy guide images: ${counts.guideImages}. Applications with stored screenshots: ${counts.applications}.`);
  if (!counts.guideImages && !counts.applications) process.exit(0);
  if (!yes) { console.log('Dry run. Re-run with --yes to move them to Google Drive.'); process.exit(0); }
  const store = createMongoTokenStore(db.collection('integration_tokens'));
  const drive = createDriveClient({ store, clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET });
  if (!(await drive.getStatus()).connected) { console.error('Google Drive is not connected. Connect it from Admin > Gallery first.'); process.exit(1); }
  const tree = createFolderTree({ drive, cacheColl: db.collection('drive_folders') });
  let failures = 0;
  for (const [label, run] of [
    ['guide images', (skip) => migrateGuideBatch({ coll: guides, drive, tree, skipPaths: skip })],
    ['applications', (skip) => migrateInterestBatch({ coll: apps, drive, tree, skipIds: skip })],
  ]) {
    const skip = []; let moved = 0;
    for (;;) {
      const r = await run(skip);
      moved += r.migrated.length;
      for (const f of r.failed) { skip.push(f.path || f.id); failures += 1; console.error(`FAILED ${f.path || f.id}: ${f.error}`); }
      if (!r.remaining || (!r.migrated.length && !r.failed.length)) break;
    }
    console.log(`${label}: moved ${moved}`);
  }
  process.exitCode = failures ? 2 : 0;
} finally { await client.close(); }
