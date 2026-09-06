'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { BEAR_SCHEDULE_CHANGED } from '../../components/BearScheduleProvider';
import { currentAllianceEvents } from '../../lib/allianceEvents.mjs';

export default function AllianceEventSchedule({ initialEvents, initialNow }) {
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState('');
  const [alliance, setAlliance] = useState('');
  const [now, setNow] = useState(initialNow);
  const [local, setLocal] = useState(false);

  useEffect(() => {
    let active = true;
    let controller;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch('/api/alliance-events', { cache: 'no-store', signal: request.signal });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.events)) throw new Error('Alliance events are temporarily unavailable.');
        if (active && !request.signal.aborted) { setEvents(result.events); setError(''); }
      } catch (err) {
        if (active && !request.signal.aborted) setError('Alliance events could not be refreshed. Please try again shortly.');
      }
    }
    function onVisible() { if (document.visibilityState === 'visible') refresh(); }
    function onStorage(event) { if (event.key === BEAR_SCHEDULE_CHANGED) refresh(); }
    setLocal(true);
    setNow(Date.now());
    refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(onVisible, 60000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(BEAR_SCHEDULE_CHANGED, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false; controller?.abort(); clearInterval(clock); clearInterval(poll);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(BEAR_SCHEDULE_CHANGED, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const scheduled = currentAllianceEvents(events || [], now);
  const tags = [...new Set(scheduled.map(event => event.alliance_tag))].sort();
  const selected = tags.includes(alliance) ? alliance : '';
  const visible = scheduled.filter(event => !selected || event.alliance_tag === selected);
  return (
    <div className="alliance-schedule">
      {error && <p role="status">{error}{events !== null ? ' Showing the last loaded schedule.' : ''}</p>}
      {events === null ? <p>{error ? 'The schedule is unavailable.' : 'Loading alliance events…'}</p> : <>
        {tags.length > 0 && <label className="alliance-schedule-filter">Alliance
          <select value={selected} onChange={event => setAlliance(event.target.value)}>
            <option value="">All alliances</option>
            {tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>}
        {visible.length === 0 ? (
          <div className="alliance-empty-state">
            <p>No alliance-specific events are listed for today or upcoming dates.</p>
            <p className="alliance-empty-hint">Daily rhythm is still live — use Bear Hunt times above, or open the kingdom calendar and transfer path.</p>
            <div className="alliance-empty-actions">
              <Link href="/events">View kingdom events</Link>
              <Link href="/chronometer">Bear Hunt & transfers</Link>
              <Link href="/guides">Read event guides</Link>
            </div>
          </div>
        ) : <div className="alliance-schedule-grid">
          {visible.map(event => {
            const start = new Date(event.starts_at);
            const seconds = Math.max(0, Math.floor((start.getTime() - now) / 1000));
            const started = start.getTime() <= now;
            const countdown = `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
            return <article key={`${event.alliance_tag}/${event.type}/${event.starts_at}`} className="alliance-schedule-card">
              <p className="alliance-schedule-tag">{event.alliance_tag}{event.alliance_name !== event.alliance_tag ? ` · ${event.alliance_name}` : ''}</p>
              <h3>{event.title}</h3>
              <p className="alliance-schedule-countdown">{started ? 'Started today' : `Starts in ${countdown}`}</p>
              <time dateTime={event.starts_at}>{local ? start.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : `${event.date} · ${event.time_utc} UTC`}</time>
              <p className="alliance-schedule-utc">{event.date} · {event.time_utc} UTC</p>
            </article>;
          })}
        </div>}
      </>}
      <style>{`
        .alliance-schedule .alliance-schedule-filter{display:flex;flex-direction:row;justify-content:flex-start;align-items:center;gap:12px;font-weight:700;margin-bottom:20px;color:var(--color-ink);text-align:left;text-transform:none}
        .alliance-schedule-filter select{font:inherit;color:var(--color-ink);background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:10px 14px}
        .alliance-schedule-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:18px}
        .alliance-schedule-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:24px;min-width:0}
        .alliance-schedule-tag{margin:0 0 12px;color:var(--color-accent-strong);font-size:13px;font-weight:800}
        .alliance-schedule-card h3{font:700 25px/1.2 var(--font-display);margin:0 0 20px;text-wrap:balance}
        .alliance-schedule-countdown{font-weight:700;font-variant-numeric:tabular-nums;margin:0 0 16px}
        .alliance-schedule-card time{font-size:14px;line-height:1.6}
        .alliance-schedule-utc{font-size:12px;color:var(--color-ink-muted);margin:6px 0 0}
        .alliance-empty-state{padding:22px 18px;border:1px dashed rgba(201,164,78,.28);border-radius:12px;background:rgba(255,255,255,.02)}
        .alliance-empty-state p{margin:0 0 8px;color:var(--parchment-dim, #c9c0a8);line-height:1.5}
        .alliance-empty-hint{font-size:13px}
        .alliance-empty-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
        .alliance-empty-actions a{color:var(--gold-hot, #e6c36a);font-size:13px;font-weight:700;text-decoration:none}
        .alliance-empty-actions a:hover{text-decoration:underline}
      `}</style>
    </div>
  );
}
