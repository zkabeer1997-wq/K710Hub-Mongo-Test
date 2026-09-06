/**
 * Seed / verify public Mongo collections for production-like density.
 * Usage: MONGODB_URI=... node scripts/seed-public-content.mjs
 * Safe: only inserts missing docs; never deletes.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}

const DEFAULT_ALLIANCES = [
  { tag: '710', name: '710', blurb: 'Main alliance', recruiting_status: 'selective', active: true, sort_order: 1, bear_times_utc: ['01:00', '13:00'], language: 'English', timezone_focus: 'UTC' },
  { tag: 'RED', name: 'RED', blurb: 'Sister alliance', recruiting_status: 'selective', active: true, sort_order: 2, bear_times_utc: ['02:00', '14:00'], language: 'English', timezone_focus: 'UTC' },
  { tag: 'SKY', name: 'SKY', blurb: 'Sister alliance', recruiting_status: 'open', active: true, sort_order: 3, bear_times_utc: ['03:00', '15:00'], language: 'English', timezone_focus: 'UTC' },
];

const DEFAULT_HOME = [
  { page: 'home', content: { key: 'hero-title', text: 'Kingdom 710' } },
  { page: 'home', content: { key: 'hero-sub', text: 'KvK-first Kingshot kingdom' } },
];

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const report = {};

  const alliances = db.collection('alliances');
  for (const row of DEFAULT_ALLIANCES) {
    const res = await alliances.updateOne(
      { tag: row.tag },
      { $setOnInsert: { ...row, created_at: new Date(), updated_at: new Date() } },
      { upsert: true }
    );
    report[`alliance:${row.tag}`] = res.upsertedCount ? 'inserted' : 'exists';
  }

  const blocks = db.collection('content_blocks');
  for (const row of DEFAULT_HOME) {
    const res = await blocks.updateOne(
      { page: row.page, 'content.key': row.content.key },
      { $setOnInsert: { ...row, created_at: new Date(), updated_at: new Date() } },
      { upsert: true }
    );
    report[`block:${row.content.key}`] = res.upsertedCount ? 'inserted' : 'exists';
  }

  const events = await db.collection('events').countDocuments({});
  let guides = 0;
  try { guides = await db.collection('kingdom_guides').countDocuments({}); } catch {}
  if (!guides) {
    try { guides = await db.collection('guides').countDocuments({}); } catch {}
  }
  report.events_count = events;
  report.guides_count = guides;
  report.alliances_count = await alliances.countDocuments({});
  report.content_blocks_count = await blocks.countDocuments({});

  console.log(JSON.stringify(report, null, 2));
  if (events === 0) console.warn('WARN: events collection is empty — create via /admin/dashboard/events');
  if (!guides) console.warn('WARN: guides empty — create via /admin/dashboard/guides');
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
