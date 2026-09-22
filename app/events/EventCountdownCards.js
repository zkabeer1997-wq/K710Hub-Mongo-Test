'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { nextEventOccurrence, recurrenceLabel, upcomingEventSeries } from '../../lib/eventRecurrence.mjs';
import { eventBlurb } from '../../lib/eventBlurb.mjs';
import { filterEventsByQuery } from '../../lib/eventSearch.mjs';

const KIND_LABEL = {
  kvk: 'KvK',
  championship: 'Championship',
  swordland: 'Swordland',
  custom: 'Kingdom Event',
};

function pad(n) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function splitDuration(ms) {
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

function formatRange(startsAt, endsAt, useLocal = true) {
  const start = new Date(startsAt);
  const optsDate = { ...(useLocal ? {} : { timeZone: 'UTC' }), weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const optsTime = { ...(useLocal ? {} : { timeZone: 'UTC' }), hour: '2-digit', minute: '2-digit' };
  const startDate = start.toLocaleDateString(useLocal ? undefined : 'en-US', optsDate);
  const startTime = start.toLocaleTimeString(useLocal ? undefined : 'en-US', optsTime);
  if (!endsAt) {
    return { local: `${startDate} · ${startTime}`, utc: `${start.toISOString().slice(0, 16).replace('T', ' ')} UTC` };
  }
  const end = new Date(endsAt);
  const endDate = end.toLocaleDateString(useLocal ? undefined : 'en-US', optsDate);
  const endTime = end.toLocaleTimeString(useLocal ? undefined : 'en-US', optsTime);
  const sameDay = startDate === endDate;
  const local = sameDay
    ? `${startDate} · ${startTime} – ${endTime}`
    : `${startDate} ${startTime} → ${endDate} ${endTime}`;
  const utc = `${start.toISOString().slice(0, 16).replace('T', ' ')} → ${end.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  return { local, utc };
}

function useNow(tickMs = 1000, initialNow = Date.now()) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

function eventStatus(event, now = Date.now()) {
  const startMs = new Date(event.starts_at).getTime();
  const endMs = event.ends_at ? new Date(event.ends_at).getTime() : null;
  const notStarted = now < startMs;
  const recurring = event.recurrence_frequency && event.recurrence_frequency !== 'none';
  const inProgress = !notStarted && (endMs == null ? !recurring : now < endMs);
  if (inProgress) return { status: 'live', startMs, endMs, notStarted, inProgress };
  if (!notStarted) return { status: 'ended', startMs, endMs, notStarted, inProgress };
  return { status: 'upcoming', startMs, endMs, notStarted, inProgress };
}

function CountdownBlock({ targetMs, label, live, now = Date.now() }) {
  const parts = splitDuration(targetMs - now);
  const done = targetMs <= now;
  return (
    <div className={`ev-countdown ${done ? 'ev-countdown-done' : ''}`}>
      <span className="ev-countdown-label">{done ? (live ? 'Ended' : 'Started') : label}</span>
      {!done && (
        <div className="ev-countdown-units" aria-live="polite">
          <div><strong>{parts.days}</strong><span>d</span></div>
          <div><strong>{pad(parts.hours)}</strong><span>h</span></div>
          <div><strong>{pad(parts.minutes)}</strong><span>m</span></div>
          <div><strong>{pad(parts.seconds)}</strong><span>s</span></div>
        </div>
      )}
    </div>
  );
}

function EventBody({ body }) {
  if (!body) return null;
  // Admin body is markdown-ish plain text; render as paragraphs without a full MD dep here.
  const blocks = String(body).trim().split(/\n{2,}/);
  return (
    <div className="ev-body">
      {blocks.map((block, i) => (
        <p key={i}>{block.split('\n').map((line, j) => (j === 0 ? line : [<br key={j} />, line]))}</p>
      ))}
    </div>
  );
}

function EventDetailPanel({ event: series }) {
  const now = useNow(1000);
  const event = nextEventOccurrence(series, now) || series;
  const { status, startMs, endMs, notStarted, inProgress } = eventStatus(event);
  const range = formatRange(event.starts_at, event.ends_at);

  return (
    <>
      <div className="ev-card-top">
        <span className="ev-kind">{KIND_LABEL[event.kind] || event.kind}</span>
        <span className={`ev-status ev-status-${status}`}>
          {status === 'live' ? 'Live now' : status === 'ended' ? 'Ended' : 'Upcoming'}
        </span>
      </div>
      <h3 className="ev-card-title">{event.title}</h3>
      {event.recurrence_frequency && event.recurrence_frequency !== 'none' && <p className="ev-recurrence">{recurrenceLabel(event)} · UTC schedule</p>}

      {notStarted && <CountdownBlock targetMs={startMs} label="Starts in" />}
      {inProgress && endMs && <CountdownBlock targetMs={endMs} label="Ends in" live />}
      {inProgress && !endMs && (
        <div className="ev-countdown ev-countdown-live">
          <span className="ev-countdown-label">In progress</span>
        </div>
      )}
      <p className="ev-blurb">{eventBlurb(event)}</p>

      <div className="ev-timings">
        <div className="ev-timing-row">
          <span className="ev-timing-label">Your local time</span>
          <span className="ev-timing-value">{range.local}</span>
        </div>
        <div className="ev-timing-row">
          <span className="ev-timing-label">UTC</span>
          <span className="ev-timing-value muted">{range.utc}</span>
        </div>
      </div>

      {event.description ? (
        <div className="ev-desc-box">
          <p>{event.description}</p>
        </div>
      ) : null}

      <EventBody body={event.body_md} />

      <div className="ev-card-actions">
        <a href={`/api/events/${event.slug}/ics`} className="ev-link-ics">
          📅 Add to calendar
        </a>
      </div>
    </>
  );
}

function EventCard({ event, onOpen, now, local }) {
  const { status, startMs, endMs, notStarted, inProgress } = eventStatus(event, now);
  const range = formatRange(event.starts_at, event.ends_at, local);

  return (
    <article className={`ev-card ev-card-${status}`}>
      <button type="button" className="ev-card-hit" onClick={() => onOpen(event)} aria-label={`Open details for ${event.title}`}>
        <div className="ev-card-top">
          <span className="ev-kind">{KIND_LABEL[event.kind] || event.kind}</span>
          <span className={`ev-status ev-status-${status}`}>
            {status === 'live' ? 'Live now' : status === 'ended' ? 'Ended' : 'Upcoming'}
          </span>
        </div>

        <h3 className="ev-card-title">{event.title}</h3>
      {event.recurrence_frequency && event.recurrence_frequency !== 'none' && <p className="ev-recurrence">{recurrenceLabel(event)} · UTC schedule</p>}

        {notStarted && <CountdownBlock now={now} targetMs={startMs} label="Starts in" />}
        {inProgress && endMs && <CountdownBlock now={now} targetMs={endMs} label="Ends in" live />}
        {inProgress && !endMs && (
          <div className="ev-countdown ev-countdown-live">
            <span className="ev-countdown-label">In progress</span>
          </div>
        )}
        <p className="ev-blurb">{eventBlurb(event)}</p>

        <div className="ev-timings">
          <div className="ev-timing-row">
            <span className="ev-timing-label">{local ? 'Your local time' : 'UTC'}</span>
            <span className="ev-timing-value">{range.local}</span>
          </div>
          <div className="ev-timing-row">
            <span className="ev-timing-label">UTC</span>
            <span className="ev-timing-value muted">{range.utc}</span>
          </div>
        </div>

        {event.description ? (
          <div className="ev-desc-box">
            <p>{event.description}</p>
          </div>
        ) : null}

        <span className="ev-open-hint">Tap for full details</span>
      </button>
    </article>
  );
}

function EventModal({ event, onClose }) {
  const titleId = useId();

  useEffect(() => {
    if (!event) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div className="ev-modal-root" role="presentation">
      <button type="button" className="ev-modal-backdrop" aria-label="Close event details" onClick={onClose} />
      <div
        className="ev-modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ev-modal-handle" aria-hidden="true" />
        <div className="ev-modal-head">
          <h2 id={titleId} className="ev-modal-title-sr">{event.title}</h2>
          <button type="button" className="ev-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ev-modal-body">
          <EventDetailPanel event={event} />
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{ events: Array<{ slug: string, title: string, kind: string, description?: string, body_md?: string, starts_at: string, ends_at?: string }> }}
 */
export default function EventCountdownCards({ events, initialNow }) {
  const [open, setOpen] = useState(null);
  const [local, setLocal] = useState(false);
  const [search, setSearch] = useState('');
  const searchId = useId();
  useEffect(() => setLocal(true), []);
  const now = useNow(1000, initialNow);
  const upcoming = upcomingEventSeries(events || [], now);
  const visible = useMemo(() => filterEventsByQuery(upcoming, search), [upcoming, search]);

  if (!events?.length) return null;

  return (
    <div className="ev-cards">
      {upcoming.length > 1 && (
        <div className="ev-search-field">
          <label htmlFor={searchId}>Search upcoming events</label>
          <div className="ev-search-input-wrap">
            <input
              id={searchId}
              type="search"
              placeholder="Search by title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="ev-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {upcoming.length === 0 && <p>No upcoming events.</p>}
      {upcoming.length > 0 && visible.length === 0 && (
        <p className="ev-search-empty">No upcoming events match “{search}”.</p>
      )}
      {visible.map(({ event, occurrence }) => (
        <EventCard key={event.slug} now={now} local={local} event={occurrence} onOpen={() => setOpen(event)} />
      ))}

      <EventModal event={open} onClose={() => setOpen(null)} />

      <style>{`
        .ev-cards{display:flex;flex-direction:column;gap:18px}
        .ev-search-field{display:flex;flex-direction:column;gap:6px;max-width:420px}
        .ev-search-field label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--color-ink-muted)}
        .ev-search-input-wrap{position:relative;display:flex;align-items:center}
        .ev-search-input-wrap input{width:100%;padding:10px 34px 10px 12px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-ink);font-size:14px}
        .ev-search-input-wrap input:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px}
        .ev-search-clear{position:absolute;right:6px;border:0;background:transparent;color:var(--color-ink-muted);cursor:pointer;padding:6px;line-height:1;border-radius:6px}
        .ev-search-clear:hover{color:var(--color-ink)}
        .ev-search-clear:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px}
        .ev-search-empty{color:var(--color-ink-muted);font-size:14px}
        .ev-card{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);transition:border-color .16s,box-shadow .16s,transform .16s}
        .ev-card:hover{border-color:var(--color-accent)}
        .ev-card-live{border-color:rgba(62,207,142,.45);box-shadow:0 0 0 1px rgba(62,207,142,.15)}
        .ev-card-hit{display:flex;flex-direction:column;gap:14px;width:100%;padding:22px 24px;margin:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit;border-radius:inherit}
        .ev-card-hit:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
        .ev-card-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .ev-kind{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:999px;background:rgba(180,140,255,.14);color:var(--color-accent-strong)}
        .ev-status{font-size:12px;font-weight:700}
        .ev-status-upcoming{color:var(--color-ink-muted)}
        .ev-status-live{color:#3ecf8e}
        .ev-status-ended{color:var(--color-ink-muted)}
        .ev-recurrence{margin:0;font-size:14px;color:var(--color-ink-muted)}
        .ev-card-title{margin:0;font-family:var(--font-display);font-size:clamp(20px,3vw,26px);line-height:1.2}
        .ev-countdown{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:12px;background:var(--color-surface-alt);border:1px solid var(--color-border)}
        .ev-countdown-live{border-color:rgba(62,207,142,.35)}
        .ev-countdown-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--color-ink-muted);font-weight:700}
        .ev-countdown-units{display:flex;gap:10px;flex-wrap:wrap}
        .ev-countdown-units > div{min-width:52px;display:flex;flex-direction:column;align-items:center;padding:6px 8px;border-radius:8px;background:var(--color-surface);border:1px solid var(--color-border)}
        .ev-countdown-units strong{font-family:var(--font-display);font-size:22px;line-height:1.1;font-variant-numeric:tabular-nums}
        .ev-countdown-units span{font-size:10px;text-transform:uppercase;color:var(--color-ink-muted);letter-spacing:.04em}
        .ev-blurb{margin:0;font-size:13px;line-height:1.5;color:var(--color-ink-muted)}
        .ev-timings{display:flex;flex-direction:column;gap:6px}
        .ev-timing-row{display:flex;flex-direction:column;gap:2px;font-size:13.5px}
        .ev-timing-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-muted);font-weight:700}
        .ev-timing-value{font-weight:600}
        .ev-timing-value.muted{font-weight:500;color:var(--color-ink-muted);font-size:12.5px}
        .ev-desc-box{padding:12px 14px;border-radius:10px;background:rgba(0,0,0,.12);border:1px solid var(--color-border)}
        .ev-desc-box p{margin:0;font-size:14px;line-height:1.55;color:var(--color-ink-muted)}
        .ev-body{display:flex;flex-direction:column;gap:10px;font-size:14.5px;line-height:1.6;color:var(--color-ink)}
        .ev-body p{margin:0}
        .ev-card-actions{display:flex;flex-wrap:wrap;gap:14px;align-items:center;padding-top:2px}
        .ev-link-ics{font-size:13px;font-weight:700;color:var(--color-accent-strong);text-decoration:none}
        .ev-link-ics:hover{text-decoration:underline}
        .ev-open-hint{font-size:12.5px;font-weight:700;color:var(--color-accent-strong)}

        .ev-modal-root{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center}
        @media (min-width:720px){
          .ev-modal-root{align-items:center;padding:24px}
          .ev-timing-row{flex-direction:row;justify-content:space-between;align-items:baseline;gap:12px}
        }
        .ev-modal-backdrop{position:absolute;inset:0;border:0;padding:0;margin:0;cursor:pointer;background:rgba(4,8,16,.72);backdrop-filter:blur(4px)}
        .ev-modal-sheet{position:relative;z-index:1;width:min(560px,100%);max-height:min(88vh,900px);overflow:auto;background:var(--color-surface);border:1px solid var(--color-border);border-radius:20px 20px 0 0;padding:12px 20px 28px;box-shadow:0 -12px 40px rgba(0,0,0,.35);animation:ev-sheet-in .22s ease-out}
        @media (min-width:720px){
          .ev-modal-sheet{border-radius:16px;padding:20px 24px 28px;animation:ev-panel-in .2s ease-out}
          .ev-modal-handle{display:none}
        }
        .ev-modal-handle{width:40px;height:4px;border-radius:999px;background:var(--color-border);margin:4px auto 10px}
        .ev-modal-head{display:flex;justify-content:flex-end;margin-bottom:4px}
        .ev-modal-title-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
        .ev-modal-close{border:1px solid var(--color-border);background:var(--color-surface-alt);color:var(--color-ink);width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:14px;line-height:1}
        .ev-modal-close:hover{border-color:var(--color-accent)}
        .ev-modal-body{display:flex;flex-direction:column;gap:14px}
        @keyframes ev-sheet-in{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes ev-panel-in{from{transform:scale(.97);opacity:0}to{transform:scale(1);opacity:1}}
      `}</style>
    </div>
  );
}
