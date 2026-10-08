'use client';

import Link from 'next/link';
import { myAppointmentRows, localSlotRange } from '../../../lib/kvkAppointments.mjs';
import DualTime from '../../ui/DualTime';
import { useEffect, useState } from 'react';

function lateApplicant(row, data) {
  if (!data.published || !data.publishedAt) return false;
  const at = Date.parse(row.application?.created_at || row.application?.updated_at || '');
  return Number.isFinite(at) && at > Date.parse(data.publishedAt);
}

// "My Appointments": one row per day/buff with the status spelled out in words
// (the coloured chip is a decoration, never the only signal).
export default function MineTab({ appts }) {
  const { data, error } = appts;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (error) return <p className="event-form-error" role="alert">{error}</p>;
  if (!data) return <p role="status">Loading…</p>;
  const rows = myAppointmentRows({ applications: data.applications, assignments: data.assignments, published: data.published });
  return (
    <div className="event-form-card appt-card">
      <p className="appt-lede">
        {data.published
          ? <>Schedule published{data.publishedAt ? <> <DualTime value={data.publishedAt} /></> : null}. Times are in UTC.</>
          : 'The schedule has not been published yet. “Pending” means leadership has not placed you yet. Your time will show here once the schedule is published.'}
      </p>
      <ul className="appt-status-list">
        {rows.map((row) => (
          <li key={`${row.day}-${row.buff}`} className={`appt-status appt-status--${row.status}`}>
            <span className="appt-status-text">{row.text}</span>
            <span className="appt-chip">{row.statusLabel}</span>
            {row.range && mounted && <span className="appt-local">{localSlotRange(row.slot)} local</span>}
            {row.status === 'pending' && (
              <span className="appt-explain">
                {lateApplicant(row, data) ? 'You applied after the schedule was published. Leadership may add you later.' : 'Pending: leadership has not placed you yet.'}
              </span>
            )}
            {row.status === 'not_applied' && <Link className="appt-link" href="?tab=apply">Apply</Link>}
            {row.status === 'pending' && <Link className="appt-link" href="?tab=apply">Edit</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
