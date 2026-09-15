import { ObjectId } from 'mongodb';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';

// Server-only helpers for the admin-managed Transfer Requests intake
// periods (lib/formGates.mjs is client-safe and must not import this).

function toRow({ _id, ...doc }) {
  return { id: String(_id), ...doc };
}

export async function listIntakePeriods() {
  const coll = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  const rows = await coll.find({}).sort({ created_at: -1 }).toArray();
  return rows.map(toRow);
}

export async function getActiveIntakePeriod() {
  const coll = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  const row = await coll.findOne({ is_active: true });
  return row ? toRow(row) : null;
}

export async function createIntakePeriod(label, { activate = false } = {}) {
  const coll = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  if (activate) {
    await coll.updateMany({ is_active: true }, { $set: { is_active: false } });
  }
  const doc = { label, is_active: !!activate, created_at: new Date() };
  const { insertedId } = await coll.insertOne(doc);
  return toRow({ _id: insertedId, ...doc });
}

export async function setActiveIntakePeriod(id) {
  if (!ObjectId.isValid(id)) return null;
  const coll = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  await coll.updateMany({ is_active: true }, { $set: { is_active: false } });
  await coll.updateOne({ _id: new ObjectId(id) }, { $set: { is_active: true } });
  const row = await coll.findOne({ _id: new ObjectId(id) });
  return row ? toRow(row) : null;
}
