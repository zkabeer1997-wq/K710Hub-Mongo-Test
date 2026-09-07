/**
 * Remove member_tool_state rows keyed by a pre-Kingshot-cutover display name
 * (e.g. "Eris") instead of a numeric Kingshot Player ID. These rows are
 * permanently unreachable: readMemberSession() always returns a numeric
 * memberId now, so no session can ever match a name-keyed row again.
 *
 * Defaults to a dry run (lists what would be deleted). Pass --execute to
 * actually delete.
 *
 * Usage:
 *   MONGODB_URI=... node scripts/cleanup-orphaned-tool-state.mjs           # dry run
 *   MONGODB_URI=... node scripts/cleanup-orphaned-tool-state.mjs --execute # deletes
 */
import { getCollection, getMongoClient } from '../lib/mongo.js';
import { COLLECTIONS } from '../lib/mongoCollections.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

const EXECUTE = process.argv.includes('--execute');
const ORPHAN_FILTER = { member_id: { $not: { $regex: '^[0-9]+$' } } };

try {
  const coll = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
  const orphans = await coll
    .find(ORPHAN_FILTER)
    .project({ member_id: 1, tool_key: 1, updated_at: 1, _id: 0 })
    .toArray();

  if (!orphans.length) {
    console.log('No orphaned rows found.');
  } else {
    console.log(`${orphans.length} orphaned row(s):`);
    for (const row of orphans) console.log(`  ${row.member_id} / ${row.tool_key} (updated ${row.updated_at})`);
  }

  if (EXECUTE && orphans.length) {
    const result = await coll.deleteMany(ORPHAN_FILTER);
    console.log(`Deleted ${result.deletedCount} row(s).`);
  } else if (orphans.length) {
    console.log('Dry run only - re-run with --execute to delete these rows.');
  }
} finally {
  const client = await getMongoClient();
  await client.close();
}
