/**
 * Move the R5 names that live as "R5: Name" in the Home page text (wb_1_desc, wb_2_desc,
 * wb_3_desc) into the structured `leaders` list on each alliance document.
 *
 *   node scripts/migrate-alliance-leaders.mjs                 dry run (default): prints what would change
 *   node scripts/migrate-alliance-leaders.mjs --apply         writes (local MongoDB only)
 *   node scripts/migrate-alliance-leaders.mjs --yes-really [--apply]   needed for ANY non-local MongoDB (even a dry run)
 *
 * Idempotent: alliances that already have a `leaders` list are skipped. Only alliances without
 * one gain it, so running twice changes nothing. The Home page text is not modified. The old
 * `leader_player_id` field is left as is.
 * Needs MONGODB_URI (and MONGODB_DB_NAME, default k710hub), same as the app.
 */
import { MongoClient } from 'mongodb';
import { planLeaderMigration } from '../lib/allianceLeaders.mjs';
import { mergePageText } from '../lib/pageText.mjs';
import { isLocalMongoUri } from '../lib/localMongo.mjs';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') && !args.has('--dry-run');
const yesReally = args.has('--yes-really');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Set MONGODB_URI (and MONGODB_DB_NAME if not k710hub).');
  process.exit(1);
}

const local = isLocalMongoUri(uri);
if (!local && !yesReally) {
  console.error('Refusing to run: MONGODB_URI is not a local MongoDB. Pass --yes-really if you really mean it (it still only reads unless --apply is also given).');
  process.exit(2);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'k710hub');
  console.log(`Database: ${db.databaseName} (${local ? 'local' : 'NOT local'}) - ${apply ? 'APPLY' : 'dry run'}`);
  const alliances = await db.collection('alliances').find({}).toArray();
  const homeDoc = await db.collection('page_text').findOne({ page: 'home' });
  const plan = planLeaderMigration(alliances, mergePageText('home', homeDoc?.values));
  if (!plan.length) console.log('Nothing to migrate: every alliance already has leaders, or none has an "R5: Name" line.');
  for (const step of plan) {
    console.log(`${apply ? 'Setting' : 'Would set'} leaders on ${step.tag}: ${step.leaders.map((l) => `${l.role} ${l.name}`).join(', ')}`);
    if (apply) {
      // The filter re-checks that `leaders` is still absent, so a concurrent admin save is never overwritten.
      const res = await db.collection('alliances').updateOne({ tag: step.tag, leaders: { $exists: false } }, { $set: { leaders: step.leaders } });
      if (!res.modifiedCount) console.log(`  skipped ${step.tag}: it gained leaders in the meantime`);
    }
  }
  if (!apply && plan.length) console.log('Dry run only. Re-run with --apply to write.');
} finally {
  await client.close();
}
