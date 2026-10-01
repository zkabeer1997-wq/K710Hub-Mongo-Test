import { NextResponse } from 'next/server';
import { bearHuntIcsEvents } from '../../../../lib/bearIcs.mjs';
import { loadPublicBearSchedule } from '../../../../lib/publicBearSchedule';
import { buildIcsCalendar } from '../../../../lib/ics';

// A daily-recurring calendar subscription for the real Bear Hunt windows -
// arguably more useful day-to-day than any single one-off event's ICS,
// since this is the schedule K710 actually runs on every day. One VEVENT
// per window with RRULE:FREQ=DAILY; no recurrence library needed since
// ICS natively expresses "every day at this UTC time."
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const tag = (request?.url ? new URL(request.url).searchParams.get('alliance') : null);
  if (tag && !/^[A-Za-z0-9]{2,10}$/.test(tag)) return NextResponse.json({ error: 'Invalid alliance.' }, { status: 400 });
  let alliances;
  try { alliances = await loadPublicBearSchedule(); }
  catch (error) {
    console.error('Bear Hunt calendar load failed', error);
    return NextResponse.json({ error: 'The Bear Hunt calendar is temporarily unavailable.' }, { status: 503 });
  }
  const events = bearHuntIcsEvents(alliances, { tag });
  if (tag && !events.length) return NextResponse.json({ error: 'No Bear Hunt times for that alliance.' }, { status: 404 });

  const ics = buildIcsCalendar({ name: tag ? `K710 ${tag.toUpperCase()} Bear Hunt Schedule` : 'K710 Bear Hunt Schedule', events });

  return new NextResponse(ics, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tag ? `k710-bear-hunt-${tag.toLowerCase()}` : 'k710-bear-hunt'}.ics"`,
    },
  });
}
