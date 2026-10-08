'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DualTime from '../ui/DualTime';
import { Table } from '../ui';
import EventCalendar from './EventCalendar';
import { upcomingEventSeries, recurrenceLabel } from '../../lib/eventRecurrence.mjs';
import { eventAllianceLabel, eventHref } from '../../lib/eventFields.mjs';

// Member /events: (1) table of the next occurrence of every published series, (2) calendar with
// recurring events expanded. Both read the same published series, so admin edits appear on the next load.
export default function EventsExplorer({ events, initialNow }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const rows = useMemo(() => upcomingEventSeries(events, now), [events, now]);

  return (
    <>
      <section className="events-section" aria-labelledby="upcoming-events-heading">
        <div className="events-sh">
          <p className="events-eyebrow">Next up</p>
          <h2 id="upcoming-events-heading" className="events-h2">Upcoming events</h2>
          <p className="events-lede">The next date of every event, in your local time and in UTC. Select an event name to open its guide.</p>
        </div>
        {rows.length === 0 ? <p className="events-empty">No upcoming events yet. Published events appear here automatically.</p> : (
          <Table className="stack-table events-table">
            <caption className="sr-only">Upcoming events with next date, repeat pattern and alliance</caption>
            <thead><tr><th scope="col">Event</th><th scope="col">Next date</th><th scope="col">Repeats</th><th scope="col">Alliance</th><th scope="col">Guide</th></tr></thead>
            <tbody>
              {rows.map(({ event, occurrence }) => (
                <tr key={event.slug}>
                  <th scope="row"><Link href={eventHref(event)}>{event.title}</Link></th>
                  <td>{event.all_day ? <time dateTime={occurrence.starts_at}>{occurrence.starts_at.slice(0, 10)} (all day, UTC)</time> : <DualTime value={occurrence.starts_at} />}</td>
                  <td>{event.recurrence_frequency && event.recurrence_frequency !== 'none' ? recurrenceLabel(event) : 'Once'}</td>
                  <td>{eventAllianceLabel(event)}</td>
                  <td>{event.guide_slug ? <Link href={`/guides/${event.guide_slug}`}>Read guide</Link> : <Link href={`/events/${event.slug}`}>Details</Link>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="events-section" aria-labelledby="event-calendar-heading">
        <div className="events-sh">
          <p className="events-eyebrow">Calendar</p>
          <h2 id="event-calendar-heading" className="events-h2">Event calendar</h2>
          <p className="events-lede">Repeating events are shown on every date they happen. Select an event to open its guide.</p>
        </div>
        <EventCalendar events={events} mode="member" views={['month', 'week']} label="Kingdom event calendar" />
      </section>
    </>
  );
}
