import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { validateEventSchedule } from '../../../../lib/eventRecurrence.mjs';

const KINDS = ['kvk', 'championship', 'swordland', 'custom'];
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function idFilter(id) {
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)) {
    return { $or: [{ id: String(id) }, { _id: new ObjectId(id) }] };
  }
  return { id: String(id) };
}

async function findEvent(coll, id) {
  return coll.findOne(idFilter(id));
}

export async function PUT(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const params = await paramsPromise;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'Missing event id.' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const coll = await getCollection(COLLECTIONS.EVENTS);
  const existing = await findEvent(coll, id);
  if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

  const update = {};
  if (body.slug !== undefined) {
    const slug = String(body.slug).trim();
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase letters, numbers, and hyphens only.' }, { status: 400 });
    }
    update.slug = slug;
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    update.title = title;
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) {
      return NextResponse.json({ error: 'Unsupported event kind.' }, { status: 400 });
    }
    update.kind = body.kind;
  }
  if (body.description !== undefined) update.description = String(body.description);
  if (body.body_md !== undefined) update.body_md = String(body.body_md);
  const { schedule, error: scheduleError } = validateEventSchedule({ ...existing, ...body });
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 });
  Object.assign(update, schedule);
  if (body.published !== undefined) update.published = Boolean(body.published);
  update.updated_at = new Date().toISOString();

  await coll.updateOne({ _id: existing._id }, { $set: update });
  const data = await coll.findOne({ _id: existing._id });
  const { _id, ...rest } = data;
  const event = { ...rest, id: rest.id || String(_id) };

  revalidatePath('/events');
  revalidatePath(`/events/${existing.slug}`);
  if (update.slug && update.slug !== existing.slug) revalidatePath(`/events/${update.slug}`);

  return NextResponse.json({ event });
}

export async function DELETE(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const params = await paramsPromise;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'Missing event id.' }, { status: 400 });

  const coll = await getCollection(COLLECTIONS.EVENTS);
  const existing = await findEvent(coll, id);
  if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

  await coll.deleteOne({ _id: existing._id });

  revalidatePath('/events');
  if (existing?.slug) revalidatePath(`/events/${existing.slug}`);

  return NextResponse.json({ ok: true });
}
