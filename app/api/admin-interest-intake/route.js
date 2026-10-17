import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

// Admin/superadmin: move one Transfer Request to a different intake period.
// Body: { id: <submission id>, period_id: <transfer_intake_periods _id> }
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const id = String(body?.id || '').trim();
  const periodId = String(body?.period_id || '').trim();
  if (!id) return NextResponse.json({ error: 'Submission id is required.' }, { status: 400 });
  if (!ObjectId.isValid(periodId)) {
    return NextResponse.json({ error: 'Choose a valid intake period.' }, { status: 400 });
  }

  try {
    const periods = await getCollection(COLLECTIONS.TRANSFER_INTAKE_PERIODS);
    const period = await periods.findOne({ _id: new ObjectId(periodId) });
    if (!period) return NextResponse.json({ error: 'Intake period not found.' }, { status: 404 });

    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    const filter = { $or: [{ id }, ...(ObjectId.isValid(id) && id.length === 24 ? [{ _id: new ObjectId(id) }, { _id: id }] : [])] };
    const result = await coll.updateOne(filter, {
      $set: { intake_period: period.label, intake_period_id: String(period._id), intake_changed_at: new Date() },
    });
    if (!result.matchedCount) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    return NextResponse.json({ intake_period: period.label, intake_period_id: String(period._id) });
  } catch (error) {
    console.error('admin-interest-intake failed', error);
    return NextResponse.json({ error: 'Unable to change intake period.' }, { status: 500 });
  }
}
