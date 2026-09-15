import { ObjectId } from 'mongodb';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';

export const EVENT_CYCLE_TYPES = ['kvk', 'flamedragon'];

// The submission collection + tag fields each cycle type rolls up.
const ROSTER_COLLECTION_BY_TYPE = {
  kvk: COLLECTIONS.SUBMISSIONS,
  flamedragon: COLLECTIONS.FLAMEDRAGON_FORMS,
};

function toRow({ _id, ...doc }) {
  return { id: String(_id), ...doc };
}

/**
 * Lazily seeds a "Season 0" cycle for a type the first time it's asked
 * for, and backfills every existing untagged roster row into it — so the
 * season filter has real data in the active season from the moment this
 * feature ships, instead of every pre-existing member looking like they
 * vanished. Safe to call repeatedly: a no-op once any cycle exists.
 */
async function ensureSeeded(type) {
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  const existing = await coll.findOne({ type });
  if (existing) return;

  const now = new Date();
  const doc = {
    type,
    label: 'Season 0',
    start_date: null,
    end_date: null,
    is_current: true,
    archived: false,
    created_at: now,
  };
  const { insertedId } = await coll.insertOne(doc);

  const rosterColl = await getCollection(ROSTER_COLLECTION_BY_TYPE[type]);
  await rosterColl.updateMany(
    { event_cycle_id: { $exists: false } },
    { $set: { event_cycle_id: String(insertedId), event_cycle_label: doc.label } }
  );
}

export async function listEventCycles(type) {
  if (!EVENT_CYCLE_TYPES.includes(type)) return [];
  await ensureSeeded(type);
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  const rows = await coll.find({ type }).sort({ created_at: -1 }).toArray();
  return rows.map(toRow);
}

export async function getCurrentEventCycle(type) {
  if (!EVENT_CYCLE_TYPES.includes(type)) return null;
  await ensureSeeded(type);
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  const row = await coll.findOne({ type, is_current: true });
  return row ? toRow(row) : null;
}

export async function createEventCycle(type, { label, start_date, end_date, activate = false }) {
  if (!EVENT_CYCLE_TYPES.includes(type)) throw new Error('Unknown cycle type.');
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  if (activate) {
    await coll.updateMany({ type, is_current: true }, { $set: { is_current: false } });
  }
  const doc = {
    type,
    label,
    start_date: start_date || null,
    end_date: end_date || null,
    is_current: !!activate,
    archived: false,
    created_at: new Date(),
  };
  const { insertedId } = await coll.insertOne(doc);
  return toRow({ _id: insertedId, ...doc });
}

export async function setCurrentEventCycle(type, id) {
  if (!ObjectId.isValid(id)) return null;
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  await coll.updateMany({ type, is_current: true }, { $set: { is_current: false } });
  await coll.updateOne({ _id: new ObjectId(id), type }, { $set: { is_current: true, archived: false } });
  const row = await coll.findOne({ _id: new ObjectId(id) });
  return row ? toRow(row) : null;
}

export async function archiveEventCycle(id) {
  if (!ObjectId.isValid(id)) return null;
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  await coll.updateOne({ _id: new ObjectId(id) }, { $set: { archived: true, is_current: false } });
  const row = await coll.findOne({ _id: new ObjectId(id) });
  return row ? toRow(row) : null;
}
