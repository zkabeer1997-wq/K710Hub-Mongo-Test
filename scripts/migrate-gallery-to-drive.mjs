#!/usr/bin/env node
/**
 * Move legacy base64 gallery images from MongoDB to Google Drive.
 *
 *   MONGODB_URI=... MONGODB_DB_NAME=... MEMBER_SESSION_SECRET=... \
 *     GOOGLE_DRIVE_CLIENT_ID=... GOOGLE_DRIVE_CLIENT_SECRET=... \
 *     node scripts/migrate-gallery-to-drive.mjs [--yes]
 *
 * Without --yes it only prints how many rows would move (dry run). It refuses
 * to run unless MONGODB_URI is set explicitly (no .env fallback), and uses the
 * same GALLERY_TOKEN_KEY / MEMBER_SESSION_SECRET as the deployed app so it can
 * decrypt the stored Drive token. Google Drive must already be connected from
 * Admin > Gallery. Safe to re-run: migrated rows are skipped.
 */
import { MongoClient } from 'mongodb';
import { createDriveClient } from '../lib/driveClient.mjs';
import { createMongoTokenStore } from '../lib/driveTokenStore.mjs';
import { countLegacyImages, migrateBatch } from '../lib/galleryMigration.mjs';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('Set MONGODB_URI explicitly (this script never reads .env files).'); process.exit(1); }
const yes = process.argv.includes('--yes');
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'k710hub');
  const images = db.collection('gallery_images');
  const total = await countLegacyImages(images);
  console.log(`Database: ${db.databaseName}. Legacy base64 images: ${total}.`);
  if (!total) process.exit(0);
  if (!yes) { console.log('Dry run. Re-run with --yes to move them to Google Drive.'); process.exit(0); }
  const store = createMongoTokenStore(db.collection('integration_tokens'));
  const drive = createDriveClient({ store, clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET });
  if (!(await drive.getStatus()).connected) { console.error('Google Drive is not connected. Connect it from Admin > Gallery first.'); process.exit(1); }
  const skip = [];
  let moved = 0;
  for (;;) {
    const r = await migrateBatch({ coll: images, drive, skipIds: skip });
    moved += r.migrated.length;
    skip.push(...r.failed.map((f) => f.id));
    r.failed.forEach((f) => console.error(`FAILED ${f.id}: ${f.error}`));
    console.log(`moved ${moved}, remaining ${r.remaining}`);
    if (!r.migrated.length && !r.failed.length) break;
    if (!r.remaining) break;
  }
  console.log(skip.length ? `Done with ${skip.length} failures (see above).` : 'Done.');
  process.exitCode = skip.length ? 2 : 0;
} finally { await client.close(); }
