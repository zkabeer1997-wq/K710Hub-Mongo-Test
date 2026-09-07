import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { validateEventSchedule } from '../../../lib/eventRecurrence.mjs';

const KINDS = ['kvk', 'championship', 'swordland', 'custom'];
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const coll = await getCollection(COLLECTIONS.EVENTS);
    const data = await coll.find({}).sort({ starts_at: 1 }).toArray();
    const events = (data || []).map(({ _id, ...rest }) => ({
      ...rest,
      id: rest.id || String(_id),
    }));
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = String(body.slug || '').trim();
  const title = String(body.title || '').trim();
  const kind = String(body.kind || 'custom').trim();
  const startsAt = body.starts_at;

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'Slug must be lowercase letters, numbers, and hyphens only.' },
      { status: 400 }
    );
  }
  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unsupported event kind.' }, { status: 400 });
  }
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
    return NextResponse.json({ error: 'A valid start date/time is required.' }, { status: 400 });
  }

  const { schedule, error: scheduleError } = validateEventSchedule(body);
  if (scheduleError) return NextResponse.json({ error: scheduleError }, { status: 400 });

  try {
    const coll = await getCollection(COLLECTIONS.EVENTS);
    const doc = {
      id: randomUUID(),
      slug,
      title,
      kind,
      description: String(body.description || ''),
      body_md: String(body.body_md || ''),
      ...schedule,
      published: Boolean(body.published),
      created_at: new Date(),
      updated_at: new Date(),
    };
    await coll.insertOne(doc);
    const { _id, ...event } = doc;
    revalidatePath('/events');
    revalidatePath(`/events/${slug}`);
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
