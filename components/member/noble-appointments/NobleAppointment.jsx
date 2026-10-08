'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localTimeLabel, localSlotRange } from '../../../lib/kvkAppointments.mjs';
import { slotInstant } from '../../../lib/myAppointment.mjs';
import { resultSeenKey } from '../../../lib/memberResults.mjs';
import { NOBLE_FORM_HREF } from '../../../lib/nobleAppointment.mjs';
import DualTime from '../../ui/DualTime';
import StackTableLabels from '../../ui/StackTableLabels';

// Member side of the Flamedragon Noble Advisor schedule: "My appointment" and "Schedule" tabs.
// Same look as the KvK My appointment page (appt-* classes). UTC first; local time added after mount.
function useNoble() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    fetch('/api/noble-appointment', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load your appointment.');
        return body;
      })
      .then((data) => { if (alive) setState({ data }); })
      .catch((err) => { if (alive) setState({ error: err.message }); });
    return () => { alive = false; };
  }, []);
  return state;
}

function MineTab({ data }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!data.published) return;
    try { window.localStorage.setItem(resultSeenKey({ key: 'my-noble-appointment', publishedAt: data.publishedAt }), '1'); } catch { /* storage unavailable */ }
  }, [data.published, data.publishedAt]);
  const instant = data.mine ? slotInstant(data.cycle?.start, 1, data.mine.slot) : null;
  const local = data.mine && mounted ? localTimeLabel(data.mine.slot, instant || new Date()) : '';
  return (
    <div className="event-form-card appt-card">
      <p className="appt-lede">
        {data.published
          ? <>Leadership published the schedule{data.publishedAt ? <> <DualTime value={data.publishedAt} /></> : null}. Times are in UTC, with your local time next to them.</>
          : 'Leadership has not published the schedule yet. Your time will show here as soon as they do.'}
      </p>
      {!data.saved && (
        <p className="appt-notice" role="status">
          You have not filled in the Noble Advisor form for this Flamedragon yet. <Link className="appt-link" href={NOBLE_FORM_HREF}>Open the form</Link>
        </p>
      )}
      {data.saved && !data.asked && (
        <p className="appt-notice" role="status">
          You said No to a Noble Advisor time, so there is nothing to place. <Link className="appt-link" href={NOBLE_FORM_HREF}>Change my answers</Link>
        </p>
      )}
      {data.saved && data.asked && (
        <ul className="appt-status-list">
          <li className={`appt-status appt-status--${data.status}`}>
            <div className="appt-status-text">
              <b>Noble Advisor</b>
              <span className="appt-role">Troop Training buff</span>
            </div>
            {data.status === 'placed' && (
              <p className="appt-when">
                <span className="appt-time">Your Noble Advisor time: {data.mine.dateLabel ? `${data.mine.dateLabel}, ` : ''}{data.mine.slot} UTC</span>
                {local ? <span className="appt-local"> ({local} your time)</span> : null}
              </p>
            )}
            {data.status === 'waiting' && <p className="appt-explain">Not placed yet - leadership publishes the schedule soon.</p>}
            {data.status === 'not_placed' && (
              <p className="appt-explain">
                You were not placed: no free time in your selected times. You can change your times in the form.{' '}
                <Link className="appt-link" href={NOBLE_FORM_HREF}>Change my times</Link>
              </p>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}

function ScheduleTab({ data }) {
  const [mounted, setMounted] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!data.published) {
    return <div className="event-form-card appt-card"><p>Leadership has not published the schedule yet. Check back soon.</p></div>;
  }
  const grid = data.schedule || [];
  const filled = grid.filter((s) => s.name).length;
  const shown = showOpen ? grid : grid.filter((s) => s.name);
  const ref = new Date();
  return (
    <div className="event-form-card appt-card">
      <StackTableLabels />
      <p className="appt-lede">Noble Advisor with Troop Training. {filled} of {grid.length} times are taken. Your own time is highlighted.</p>
      <button type="button" className="appt-daytab" aria-pressed={showOpen} onClick={() => setShowOpen((v) => !v)}>
        {showOpen ? 'Hide open times' : 'Show open times too'}
      </button>
      <div className="appt-table-wrap">
        <table className="appt-table stack-table">
          <caption className="sr-only">Noble Advisor schedule</caption>
          <thead>
            <tr><th scope="col">Time (UTC)</th><th scope="col">Your local time</th><th scope="col">Who</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={3}>Nobody is booked yet.</td></tr>}
            {shown.map((s) => (
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

export default function NobleAppointment({ tab }) {
  const state = useNoble();
  if (state.loading) return <p role="status">Loading…</p>;
  if (state.error) return <p className="event-form-error" role="alert">{state.error}</p>;
  if (!state.data.cycle) {
    return <div className="event-form-card appt-card"><p>There is no Flamedragon Tyrant round open right now, so there is no Noble Advisor schedule.</p></div>;
  }
  return (
    <div id={`appt-panel-${tab}`} className="appt-panel">
      {tab === 'mine' ? <MineTab data={state.data} /> : <ScheduleTab data={state.data} />}
    </div>
  );
}
