'use client';

import { useEffect, useState } from 'react';
import { APPOINTMENT_TYPES, localSlotRange } from '../../../lib/kvkAppointments.mjs';

// Published schedule: 30-minute slots per day, UTC first and viewer-local second.
export default function ScheduleTab() {
  const [state, setState] = useState({ loading: true });
  const [mounted, setMounted] = useState(false);
  const [dayKey, setDayKey] = useState(`${APPOINTMENT_TYPES[0].day}:${APPOINTMENT_TYPES[0].buff}`);
  useEffect(() => {
    setMounted(true);
    let alive = true;
    fetch('/api/kvk-appointments/schedule', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load the schedule.');
        return body;
      })
      .then((body) => { if (alive) setState({ body }); })
      .catch((err) => { if (alive) setState({ error: err.message }); });
    return () => { alive = false; };
  }, []);

  if (state.loading) return <p role="status">Loading…</p>;
  if (state.error) return <p className="event-form-error" role="alert">{state.error}</p>;
  if (!state.body.published) {
    return <div className="event-form-card appt-card"><p>The schedule has not been published yet. Check back after leadership allocates the slots.</p></div>;
  }
  const day = state.body.days.find((d) => `${d.day}:${d.buff}` === dayKey) || state.body.days[0];
  const ref = new Date();
  return (
    <div className="event-form-card appt-card">
      <div className="appt-daytabs" role="group" aria-label="Day">
        {state.body.days.map((d) => {
          const key = `${d.day}:${d.buff}`;
          return (
            <button key={key} type="button" className="appt-daytab" aria-pressed={key === dayKey} onClick={() => setDayKey(key)}>
              Day {d.day} {d.label}
            </button>
          );
        })}
      </div>
      <p className="appt-lede">{day.title} with the {day.role}. {day.filled} of {day.slots.length} slots booked.</p>
      <div className="appt-table-wrap">
        <table className="appt-table">
          <caption className="sr-only">{day.title} schedule</caption>
          <thead>
            <tr><th scope="col">Slot (UTC)</th><th scope="col">Your local time</th><th scope="col">Member</th></tr>
          </thead>
          <tbody>
            {day.slots.map((s) => (
              <tr key={s.slot} className={s.mine ? 'is-mine' : ''}>
                <td className="appt-mono">{s.range}</td>
                <td className="appt-mono">{mounted ? localSlotRange(s.slot, ref) : ''}</td>
                <td>{s.name ? <>{s.name}{s.mine && <b className="appt-you"> (you)</b>}</> : <span className="appt-open">Open</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
