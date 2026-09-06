import { NextResponse } from 'next/server';
import { getCollection } from '../../../../../lib/mongo';
import { COLLECTIONS } from '../../../../../lib/mongoCollections';
import { buildIcsCalendar } from '../../../../../lib/ics';
import { readMemberSession } from '../../../../../lib/memberAuth';
import { recurrenceRule } from '../../../../../lib/eventRecurrence.mjs';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export async function GET(request, { params: paramsPromise }) {
  const session = await readMemberSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
  }

  const params = await paramsPromise;
  const slug = params?.slug;
  if (!SLUG_RE.test(slug || '')) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.EVENTS);
    const event = await coll.findOne(
      { slug },
      {
        projection: {
          slug: 1, title: 1, description: 1, starts_at: 1, ends_at: 1, published: 1,
          recurrence_frequency: 1, recurrence_interval: 1, recurrence_until: 1, _id: 0,
        },
      }
    );

    if (!event || !event.published) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const ics = buildIcsCalendar({
      name: event.title,
      events: [{
        uid: `${event.slug}@k710hub`,
        start: new Date(event.starts_at),
        end: event.ends_at ? new Date(event.ends_at) : null,
        summary: event.title,
        rrule: recurrenceRule(event),
        description: event.description,
      }],
    });

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
