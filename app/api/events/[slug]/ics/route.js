import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../../../lib/adminSupabase';
import { buildIcsCalendar } from '../../../../../lib/ics';
import { readMemberSession } from '../../../../../lib/memberAuth';

import { RECURRENCE_FIELDS, recurrenceRule } from '../../../../../lib/eventRecurrence.mjs';

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

  const supabase = createAdminSupabaseClient();
  const { data: event, error } = await supabase
    .from('events')
    .select(`slug, title, description, starts_at, ends_at, published, ${RECURRENCE_FIELDS}`)
    .eq('slug', slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
}
