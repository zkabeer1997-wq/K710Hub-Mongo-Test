'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { myAppointmentView, slotInstant } from '../../../lib/myAppointment.mjs';
import { localTimeLabel } from '../../../lib/kvkAppointments.mjs';
import DualTime from '../../ui/DualTime';

const PREP_HREF = '/prep-phase-backpack';

// "My appointment": one row per prep day with the time leadership gave you, in words.
// The server render shows UTC only; the viewer's local time is added after mount (no hydration mismatch).
export default function MineTab({ appts }) {
  const { data, error } = appts;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (error) return <p className="event-form-error" role="alert">{error}</p>;
  if (!data) return <p role="status">Loading…</p>;
  const rows = myAppointmentView({ prep: data.prep, assignments: data.assignments, published: data.published, cycleStart: data.cycleStart });
  const saved = data.prep?.saved;
  const asked = rows.some((r) => r.wanted || r.status === 'placed');
  return (
    <div className="event-form-card appt-card">
      <p className="appt-lede">
        {data.published
          ? <>Leadership published the schedule{data.publishedAt ? <> <DualTime value={data.publishedAt} /></> : null}. Times are in UTC, with your local time next to them.</>
          : 'Leadership has not published the schedule yet. Your time will show here as soon as they do.'}
      </p>
      {!saved && (
        <p className="appt-notice" role="status">
          You have not filled in the KvK Prep &amp; Appointments form for this KvK yet. <Link className="appt-link" href={PREP_HREF}>Open the form</Link>
        </p>
      )}
      {saved && !asked && (
        <p className="appt-notice" role="status">
          You said No to every buff, so there is nothing to place. <Link className="appt-link" href={PREP_HREF}>Change my answers</Link>
        </p>
      )}
      <ul className="appt-status-list">
        {rows.map((row) => {
          const instant = row.slot ? slotInstant(data.cycleStart, row.day, row.slot) : null;
          const local = row.slot && mounted ? localTimeLabel(row.slot, instant || new Date()) : '';
          return (
            <li key={`${row.day}-${row.buff}`} className={`appt-status appt-status--${row.status}`}>
              <div className="appt-status-text">
                <b>{row.title}</b>
                <span className="appt-role">{row.role} buff</span>
              </div>
              {row.status === 'placed' && (
                <p className="appt-when">
                  <span className="appt-time">{row.dateLabel ? `${row.dateLabel}, ` : ''}{row.slot} UTC</span>
                  {local ? <span className="appt-local"> ({local} your time)</span> : null}
                </p>
              )}
              {row.status === 'waiting' && <p className="appt-explain">Not placed yet - leadership publishes the schedule soon.</p>}
              {row.status === 'not_placed' && (
                <p className="appt-explain">
                  You were not placed on Day {row.day}: no free time in your selected times. You can still change your times in the form.{' '}
                  <Link className="appt-link" href={PREP_HREF}>Change my times</Link>
                </p>
              )}
              {row.status === 'not_asked' && <p className="appt-explain appt-explain--quiet">You did not ask for this buff.</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
