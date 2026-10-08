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
 * Lazily seeds a "First cycle" cycle for a type the first time it's asked
 * for, and backfills every existing untagged roster row into it — so the
 * cycle filter has real data in the active cycle from the moment this
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
    label: 'First cycle',
    start_date: null,
    end_date: null,
    is_current: true,
    archived: false,
    created_at: now,
    // Unique (sparse) key so two concurrent first requests cannot both seed.
    seed_key: type,
  };
  let insertedId;
  try {
    ({ insertedId } = await coll.insertOne(doc));
  } catch (error) {
    if (error?.code === 11000) return; // another request seeded it first
    throw error;
  }

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
  const before = await coll.findOne({ _id: new ObjectId(id) });
  if (before) {
    // Only the current cycle owns the untagged (legacy) rally rows; an old cycle just keeps its roster snapshot.
    if (before.is_current) await retireEventCycle(toRow(before));
    else await snapshotCycleRoster(before.type, toRow(before));
  }
  await coll.updateOne({ _id: new ObjectId(id) }, { $set: { archived: true, is_current: false } });
  const row = await coll.findOne({ _id: new ObjectId(id) });
  return row ? toRow(row) : null;
}

// ---------------------------------------------------------------------------
// History: one roster row per member is overwritten when a member resubmits in a
// new cycle, so the previous cycle's row is copied into event_cycle_snapshots
// first. Past-cycle exports read from there.
// ---------------------------------------------------------------------------

export const RALLY_COLLECTION_BY_TYPE = {
  kvk: COLLECTIONS.ADMIN_RALLIES,
  flamedragon: COLLECTIONS.FLAMEDRAGON_ADMIN_RALLIES,
};

/** Roster row -> plain payload (no _id, never the PIN hash). */
function snapshotPayload(row) {
  const { _id, pin_hash, ...rest } = row || {};
  return rest;
}

/** Snapshot one roster row for a cycle (once per member per cycle; later calls keep the first copy). */
export async function snapshotRosterRow(type, row, cycle) {
  if (!row?.member_id || !cycle?.id) return;
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLE_SNAPSHOTS);
  const filter = { event_type: type, event_cycle_id: String(cycle.id), member_id: String(row.member_id) };
  await coll.updateOne(
    filter,
    { $setOnInsert: { label: cycle.label || '', payload: snapshotPayload(row), archived_at: new Date() } },
    { upsert: true }
  );
}

/**
 * Call before a submit handler overwrites a roster row: when the stored row belongs to an
 * earlier cycle than the current one, keep a copy of it. Never throws (history must not block a submit).
 */
export async function snapshotIfFromPastCycle(type, existingRow, currentCycle) {
  try {
    const oldId = existingRow?.event_cycle_id;
    if (!currentCycle || !oldId || String(oldId) === String(currentCycle.id)) return;
    await snapshotRosterRow(type, existingRow, { id: oldId, label: existingRow.event_cycle_label || '' });
  } catch (error) {
    console.error('event cycle snapshot failed', error);
  }
}

/** Snapshot every roster row tagged with this cycle. Returns how many rows were copied/kept. */
export async function snapshotCycleRoster(type, cycle) {
  const roster = await getCollection(ROSTER_COLLECTION_BY_TYPE[type]);
  const rows = await roster.find({ event_cycle_id: String(cycle.id) }).toArray();
  for (const row of rows) await snapshotRosterRow(type, row, cycle);
  return rows.length;
}

/**
 * Freeze a cycle that is no longer current: snapshot its roster and pin any legacy
 * (untagged) rally rows to it so the next cycle's planner starts clean.
 */
export async function retireEventCycle(cycle) {
  const type = cycle.type;
  if (!EVENT_CYCLE_TYPES.includes(type)) return;
  await snapshotCycleRoster(type, cycle);
  const rallies = await getCollection(RALLY_COLLECTION_BY_TYPE[type]);
  await rallies.updateMany({ event_cycle_id: { $exists: false } }, { $set: { event_cycle_id: String(cycle.id) } });
}

/** Mongo filter for the rally rows that belong to the current cycle (untagged rows count as current). */
export async function currentRallyScope(type) {
  const cycle = await getCurrentEventCycle(type).catch(() => null);
  if (!cycle) return { cycleId: null, filter: { event_cycle_id: { $exists: false } } };
  return { cycleId: cycle.id, filter: { $or: [{ event_cycle_id: cycle.id }, { event_cycle_id: { $exists: false } }] } };
}

function pickProjection(row, projection) {
  if (!projection) return row;
  const out = {};
  for (const [key, on] of Object.entries(projection)) {
    if (key !== '_id' && on && key in row) out[key] = row[key];
  }
  return out;
}

/** Distinct member ids that belong to a cycle (live tagged rows plus snapshots). */
export async function cycleMemberIds(type, cycleId) {
  const roster = await getCollection(ROSTER_COLLECTION_BY_TYPE[type]);
  const snaps = await getCollection(COLLECTIONS.EVENT_CYCLE_SNAPSHOTS);
  const [live, frozen] = await Promise.all([
    roster.find({ event_cycle_id: String(cycleId) }).project({ member_id: 1, _id: 0 }).toArray(),
    snaps.find({ event_type: type, event_cycle_id: String(cycleId) }).project({ member_id: 1, _id: 0 }).toArray(),
  ]);
  return new Set([...live, ...frozen].map((r) => String(r.member_id)));
}

/**
 * Roster rows for one cycle, for admin exports. Live rows tagged with the cycle are combined
 * with its snapshots (the snapshot wins: it is the frozen copy). Returns null for an unknown cycle.
 */
export async function loadCycleRoster(type, cycleId, projection = null) {
  if (!EVENT_CYCLE_TYPES.includes(type) || !ObjectId.isValid(cycleId)) return null;
  const cycles = await getCollection(COLLECTIONS.EVENT_CYCLES);
  const cycle = await cycles.findOne({ _id: new ObjectId(cycleId), type });
  if (!cycle) return null;
  const id = String(cycle._id);
  const roster = await getCollection(ROSTER_COLLECTION_BY_TYPE[type]);
  const snaps = await getCollection(COLLECTIONS.EVENT_CYCLE_SNAPSHOTS);
  const [live, frozen] = await Promise.all([
    roster.find({ event_cycle_id: id }).toArray(),
    snaps.find({ event_type: type, event_cycle_id: id }).toArray(),
  ]);
  const byMember = new Map();
  for (const row of live) byMember.set(String(row.member_id), snapshotPayload(row));
  for (const snap of frozen) byMember.set(String(snap.member_id), snap.payload || {});
  return { cycle: toRow(cycle), rows: [...byMember.values()].map((row) => pickProjection(row, projection)) };
}
