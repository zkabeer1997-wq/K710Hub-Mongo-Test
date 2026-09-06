import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from './adminAuth';

// Every editable text field on the homepage, with its default copy.
// Each becomes a row in content_blocks (page = 'home', type = 'text',
// content = { key, text }). Missing rows are seeded automatically the
// first time the page renders. Unique index on (page, content.key).
export const HOME_FIELDS = [
  { key: 'hero-kicker', text: 'Kingshot · Kingdom 710' },
  { key: 'hero-title', text: 'Welcome to Kingdom 710.' },
  { key: 'hero-sub', text: 'We are a multilingual Kingshot kingdom with three alliances: 710, RED, and SKY. Use this site to check events, update your player profile, plan upgrades, or apply for a transfer.' },
  { key: 'why-head-kicker', text: 'About the kingdom' },
  { key: 'why-head-title', text: 'How 710 works' },
  { key: 'why-head-sub', text: 'We coordinate across three alliances. Players share event information, prepare together for KvK, and use the same member tools on this site.' },
  { key: 'why-1-title', text: 'Seven Bear Hunt times' },
  { key: 'why-1-body', text: 'The schedules are spread across different time zones. Check the Events page to find the alliance and hunt time that work for you.' },
  { key: 'why-2-title', text: 'Transfers are reviewed' },
  { key: 'why-2-body', text: 'We review your account, preferred event times, and KvK participation before confirming a place. The transfer form explains what information is required.' },
  { key: 'why-3-title', text: 'One website for member tasks' },
  { key: 'why-3-body', text: 'Members can update their power profile, submit KvK availability, check events, read guides, and use the upgrade calculators here.' },

  { key: 'wb-head-kicker', text: 'Alliance schedules' },
  { key: 'wb-head-title', text: '710, RED, and SKY' },
  { key: 'wb-head-sub', text: 'Each alliance has different Bear Hunt times. Open an alliance page to see its current schedule and leadership.' },
  { key: 'wb-1-name', text: '710' },
  { key: 'wb-1-desc', text: 'Two Bear Hunts each day.\n\nR5: Yumin' },
  { key: 'wb-2-name', text: 'RED' },
  { key: 'wb-2-desc', text: 'Three Bear Hunts each day.\n\nR5: Woff' },
  { key: 'wb-3-name', text: 'SKY' },
  { key: 'wb-3-desc', text: 'Two Bear Hunts each day.\n\nR5: Asriellexx' },

  { key: 'steps-head-kicker', text: 'Transfers' },
  { key: 'steps-head-title', text: 'How to join Kingdom 710' },
  { key: 'steps-head-sub', text: 'Submit the transfer form with your battle reports. Leadership reviews applications and confirms intake windows.' },
  { key: 'step-1-title', text: 'Submit the transfer form' },
  { key: 'step-1-body', text: 'Include battle report screenshots and the details the form asks for.' },
  { key: 'step-2-title', text: 'Get reviewed' },
  { key: 'step-2-body', text: 'Troop tier, T11 status, Mystic Trial stages, power, and honest commitment questions.' },
  { key: 'step-3-title', text: 'Pick your intake window' },
  { key: 'step-3-body', text: 'New intake opens monthly — apply now, transfer when your window lands.' },
  { key: 'step-4-title', text: 'March in, report to your alliance' },
  { key: 'step-4-body', text: "Land in 710, RED, or SKY and get looped into your alliance's rally schedule." },
];

// Older promotional strings — if stored text still matches these, prefer the new defaults.
const LEGACY_HOME_COPY = {
  'hero-kicker': 'KINGDOM 710 · KINGSHOT',
  'hero-title': 'Kingdom 710',
  'hero-sub': 'A competitive kingdom built on discipline, coordination, and shared standards.',
  'why-1-title': 'Seven coordinated Bear windows',
  'why-2-title': 'Selective transfers',
  'why-3-title': 'One shared operating system',
  'step-1-title': 'Submit the transfer form',
  'step-2-title': 'Get reviewed',
  'step-3-title': 'Pick your intake window',
  'step-4-title': 'March in, report to your alliance',
};

export async function checkIsAdmin() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(ADMIN_COOKIE_NAME);
    return isValidAdminToken(cookie && cookie.value);
  } catch {
    return false;
  }
}

function rowId(row) {
  if (!row) return null;
  if (row.id) return row.id;
  if (row._id) return String(row._id);
  return null;
}

// Returns a map: key -> { id, text }. Seeds any missing fields once via upsert.
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
        existing[key] = { ...row, id: rowId(row) };
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
          existing[key] = { ...row, id: rowId(row) };
        }
      }
    }

    for (const f of HOME_FIELDS) {
      const row = existing[f.key];
      if (row) {
        const storedText =
          row.content && row.content.text != null ? row.content.text : f.text;
        const legacy = LEGACY_HOME_COPY[f.key];
        map[f.key] = {
          id: row.id,
          text:
            legacy && String(storedText).trim() === legacy
              ? f.text
              : storedText,
        };
      }
    }
    return map;
  } catch {
    return map;
  }
}
