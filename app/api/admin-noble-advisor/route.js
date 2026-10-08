import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { NOBLE_FIELDS, validateNobleAdvisor } from '../../../lib/nobleAdvisor.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

// Rows may carry a string `id` (new) or only a Mongo _id (older rows); the admin
// list hands back String(_id), so cast it before matching.
function idFilter(id) {
  const value = String(id);
  if (ObjectId.isValid(value) && String(new ObjectId(value)) === value) {
    return { $or: [{ id: value }, { _id: new ObjectId(value) }] };
  }
  return { id: value };
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  try {
    const coll = await getCollection('noble_advisor_submissions');
    const data = await coll.find({}).sort({ created_at: 1 }).toArray();
    return NextResponse.json(
      {
        rows: (data || []).map(({ _id, ...r }) => ({ ...r, id: r.id || String(_id) })),
      },
      { headers }
    );
  } catch {
    return NextResponse.json({ rows: [] }, { headers });
  }
}

export async function PATCH(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid update.' }, { status: 400, headers });
  }
  if (!body?.id || !NOBLE_FIELDS.includes(body.key)) {
    return NextResponse.json({ error: 'Invalid field.' }, { status: 400, headers });
  }
  try {
    const coll = await getCollection('noble_advisor_submissions');
    const existing = await coll.findOne(idFilter(body.id));
    if (!existing) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404, headers });
    }
    const { _id, ...rest } = existing;
    const { record, error } = validateNobleAdvisor({ ...rest, [body.key]: body.value });
    if (error) return NextResponse.json({ error }, { status: 400, headers });
    await coll.updateOne(
      idFilter(body.id),
      { $set: { [body.key]: record[body.key], updated_at: new Date() } }
    );
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to save booking.' }, { status: 500, headers });
  }
}
