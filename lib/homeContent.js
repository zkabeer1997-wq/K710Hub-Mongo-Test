import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from './adminAuth';

const LEGACY_HOME_COPY = {
  'hero-title': 'Kingdom 710',
  'hero-subtitle': 'A competitive kingdom built on discipline, coordination, and shared standards.',
  'hero-cta-primary': 'Join Interest Form',
  'hero-cta-secondary': 'View Guides',
};

const HOME_FIELDS = [
  { key: 'hero-title', text: 'Kingdom 710' },
  { key: 'hero-subtitle', text: 'A competitive kingdom built on discipline, coordination, and shared standards.' },
  { key: 'hero-cta-primary', text: 'Join Interest Form' },
  { key: 'hero-cta-secondary', text: 'View Guides' },
];

export async function checkIsAdmin() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    return isValidAdminToken(token);
  } catch {
    return false;
  }
}

// Returns a map: key -> { id, text }. Seeds any missing fields once, using an
// idempotent upsert so concurrent renders can never create duplicate rows.
export async function getHomeContent() {
  const map = {};
  for (const f of HOME_FIELDS) map[f.key] = { id: null, text: f.text };
  try {
    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);

    let data = await coll
      .find({ page: 'home' })
      .project({ id: 1, content: 1, _id: 1 })
      .toArray();

    let existing = {};
    for (const row of data || []) {
      const key = row.content && row.content.key;
      if (key && !existing[key]) {
        existing[key] = { ...row, id: row.id || String(row._id) };
      }
    }

    const missing = HOME_FIELDS.filter((f) => !existing[f.key]);
    if (missing.length) {
      const now = new Date().toISOString();
      for (let i = 0; i < missing.length; i++) {
        const f = missing[i];
        await coll.updateOne(
          { page: 'home', 'content.key': f.key },
          {
            $setOnInsert: {
              page: 'home',
              type: 'text',
              position: 1000 + i,
              content: { key: f.key, text: f.text },
              created_at: now,
              updated_at: now,
            },
          },
          { upsert: true }
        );
      }

      data = await coll
        .find({ page: 'home' })
        .project({ id: 1, content: 1, _id: 1 })
        .toArray();
      existing = {};
      for (const row of data || []) {
        const key = row.content && row.content.key;
        if (key && !existing[key]) {
          existing[key] = { ...row, id: row.id || String(row._id) };
        }
      }
    }

    for (const f of HOME_FIELDS) {
      const row = existing[f.key];
      if (row) {
        const storedText = (row.content && row.content.text) != null ? row.content.text : f.text;
        map[f.key] = {
          id: row.id,
          text: storedText.trim() === LEGACY_HOME_COPY[f.key] ? f.text : storedText,
        };
      }
    }
    return map;
  } catch (error) {
    return map;
  }
}
