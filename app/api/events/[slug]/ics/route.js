import { NextResponse } from 'next/server';
import { getCollection } from '../../../../../lib/mongo';
import { COLLECTIONS } from '../../../../../lib/mongoCollections';
import { buildIcsCalendar } from '../../../../../lib/ics';
import { loadPublicBearScheduleOrNull } from '../../../../../lib/publicBearSchedule';
import { findDefaultEvent } from '../../../../../lib/defaultEvents.mjs';
import { recurrenceRule } from '../../../../../lib/eventRecurrence.mjs';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export async function GET(_request, { params: paramsPromise }) {
  const params = await paramsPromise;
  const slug = params?.slug;
  if (!SLUG_RE.test(slug || '')) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }

  try {
    // Published events are public, so their calendar files are too. A built-in
    // default (see lib/defaultEvents.mjs) is used when no stored event overrides it.
    const coll = await getCollection(COLLECTIONS.EVENTS);
    let event = await coll.findOne(
      { slug },
      {
        projection: {
          slug: 1, title: 1, description: 1, starts_at: 1, ends_at: 1, published: 1,
          recurrence_frequency: 1, recurrence_interval: 1, recurrence_until: 1, recurrence_count: 1, series_id: 1, recurrence_weekdays: 1, exdates: 1, all_day: 1, guide_slug: 1, alliance_tags: 1, _id: 0,
        },
      }
    );

    if (!event) event = findDefaultEvent(slug, (await loadPublicBearScheduleOrNull()) || []);
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
        exdates: event.exdates || [],
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
    console.error('events/[slug]/ics' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
