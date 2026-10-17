import { ObjectId } from 'mongodb';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { normalizeCap, normalizeStatus } from './intakeProjection.mjs';

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

// Admin edits to a period's projected status and power caps.
export async function updateIntakePeriodSettings(id, body = {}) {
  if (!ObjectId.isValid(id)) return null;
  const set = {};
  if ('transfer_status' in body) set.transfer_status = normalizeStatus(body.transfer_status);
  if ('leading_cap' in body) set.leading_cap = normalizeCap(body.leading_cap);
  if ('ordinary_cap' in body) set.ordinary_cap = normalizeCap(body.ordinary_cap);
  const coll = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  if (Object.keys(set).length) {
    set.updated_at = new Date();
    await coll.updateOne({ _id: new ObjectId(id) }, { $set: set });
  }
  const row = await coll.findOne({ _id: new ObjectId(id) });
  return row ? toRow(row) : null;
}

// Requests filed under a period: matched by id, or by label for older rows
// that predate intake_period_id (only when no other period shares the label).
export async function countRequestsInPeriod(period) {
  const periods = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  const sameLabel = await periods.countDocuments({ label: period.label });
  const subs = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
  const or = [{ intake_period_id: String(period._id) }];
  if (sameLabel <= 1) or.push({ intake_period: period.label });
  return subs.countDocuments({ $or: or });
}

// Returns { ok } or { error, status }. The current period and periods that
// still hold requests cannot be removed.
export async function deleteIntakePeriod(id) {
  if (!ObjectId.isValid(id)) return { error: 'Intake period not found.', status: 404 };
  const coll = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
  const period = await coll.findOne({ _id: new ObjectId(id) });
  if (!period) return { error: 'Intake period not found.', status: 404 };
  if (period.is_active) {
    return { error: 'This is the current intake period. Make another period current before removing it.', status: 409 };
  }
  const count = await countRequestsInPeriod(period);
  if (count > 0) {
    return { error: `${period.label} still has ${count} request${count === 1 ? '' : 's'}. Move ${count === 1 ? 'it' : 'them'} to another period first.`, status: 409 };
  }
  await coll.deleteOne({ _id: period._id });
  return { ok: true };
}
