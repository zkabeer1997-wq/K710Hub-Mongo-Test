'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HOUR, clock, dayKey, dayName, describeOccurrence, isAllDay, makeMs, monthName, occurrencesInRange,
  occurrencesOnDay, rangeLabel, shiftAnchor, tzParts, viewDays,
} from '../../lib/eventCalendar.mjs';
import { eventAllianceLabel, eventHref } from '../../lib/eventFields.mjs';
import { recurrenceLabel } from '../../lib/eventRecurrence.mjs';
import './event-calendar.css';

const HOUR_PX = 44;
const SNAP = 30;
const VIEW_LABEL = { month: 'Month', week: 'Week', day: 'Day' };

function useNarrow() {
  const [narrow, setNarrow] = useState(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

function chipClass(occ, extra = '') {
  const { event } = occ;
  return `evcal-chip kind-${event.kind || 'custom'}${event.published === false ? ' is-draft' : ''}${event.is_default ? ' is-default' : ''} ${extra}`.trim();
}

// Members follow the event to its guide (or detail page); admins open the editor.
function OccLink({ occ, mode, onOpen, utc, className, style, children }) {
  const label = `${describeOccurrence(occ, utc)}${occ.event.published === false ? ', draft' : ''}`;
  if (mode === 'member') {
    return <Link href={eventHref(occ.event)} className={className} style={style} aria-label={label}>{children}</Link>;
  }
  return (
    <button type="button" className={className} style={style} aria-label={`${label}. Edit`} onClick={(e) => { e.stopPropagation(); onOpen?.(occ); }}>
      {children}
    </button>
  );
}

function OccItem({ occ, mode, onOpen, utc }) {
  const other = !utc;
  const timeMain = isAllDay(occ) ? 'All day' : clock(occ.startMs, utc);
  const otherTime = isAllDay(occ) ? '' : `${clock(occ.startMs, other)} ${other ? 'UTC' : 'local'}`;
  const repeats = occ.event.recurrence_frequency && occ.event.recurrence_frequency !== 'none' ? recurrenceLabel(occ.event) : 'Once';
  return (
    <li>
      <OccLink occ={occ} mode={mode} onOpen={onOpen} utc={utc} className={chipClass(occ, 'evcal-item')}>
        <span className="evcal-item-time">{timeMain}<small>{utc ? 'UTC' : 'local'}</small></span>
        <span className="evcal-item-main">
          <strong>{occ.event.title}{occ.event.published === false ? ' (draft)' : ''}</strong>
          <small>{[otherTime, repeats, eventAllianceLabel(occ.event)].filter(Boolean).join(' · ')}</small>
        </span>
        {mode === 'member' && occ.event.guide_slug ? <span className="evcal-item-go" aria-hidden="true">Guide ›</span> : null}
      </OccLink>
    </li>
  );
}

function DayList({ day, items, mode, onOpen, onCreate, utc, today }) {
  const list = occurrencesOnDay(items, day);
  return (
    <section className="evcal-daylist" aria-label={`${dayName(day.dow)} ${monthName(day.m)} ${day.d}`}>
      <h3>
        {dayName(day.dow)}, {monthName(day.m)} {day.d}
        {today ? <span className="evcal-today-tag">Today</span> : null}
      </h3>
      {list.length ? (
        <ul>{list.map(occ => <OccItem key={`${occ.key}-${day.key}`} occ={occ} mode={mode} onOpen={onOpen} utc={utc} />)}</ul>
      ) : <p className="evcal-empty">No events.</p>}
      {mode === 'admin' && (
        <button type="button" className="evcal-add" onClick={() => onCreate(makeMs(day.y, day.m, day.d, 12, 0, utc), makeMs(day.y, day.m, day.d, 13, 0, utc))}>
          + Add event on {monthName(day.m).slice(0, 3)} {day.d}
        </button>
      )}
    </section>
  );
}

function MonthGrid({ days, items, mode, onOpen, onCreate, utc, todayKey, anchorMonth, selected, setSelected, narrow, goDay }) {
  const heads = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="evcal-month" role="grid" aria-label={`${monthName(anchorMonth)} calendar`}>
      <div className="evcal-month-head" role="row">
        {heads.map(d => <div key={d} role="columnheader" aria-label={dayName(d)}>{narrow ? dayName(d)[0] : dayName(d).slice(0, 3)}</div>)}
      </div>
      {Array.from({ length: 6 }, (_, w) => (
        <div className="evcal-month-row" role="row" key={w}>
          {days.slice(w * 7, w * 7 + 7).map(day => {
            const list = occurrencesOnDay(items, day);
            const out = day.m !== anchorMonth;
            const isToday = day.key === todayKey;
            const full = `${dayName(day.dow)} ${monthName(day.m)} ${day.d}`;
            const count = `${list.length} event${list.length === 1 ? '' : 's'}`;
            const create = () => onCreate(makeMs(day.y, day.m, day.d, 12, 0, utc), makeMs(day.y, day.m, day.d, 13, 0, utc));
            if (narrow) {
              return (
                <div role="gridcell" key={day.key} className={`evcal-cell${out ? ' is-out' : ''}${isToday ? ' is-today' : ''}${selected === day.key ? ' is-selected' : ''}`}>
                  <button type="button" className="evcal-cell-btn" aria-label={`${full}, ${count}${isToday ? ', today' : ''}`} aria-pressed={selected === day.key} onClick={() => setSelected(day.key)}>
                    <span className="evcal-daynum">{day.d}</span>
                    {list.length > 0 && (
                      <span className="evcal-dots" aria-hidden="true">
                        {list.slice(0, 3).map(occ => <i key={occ.key} className={`kind-${occ.event.kind || 'custom'}`} />)}
                        {list.length > 3 ? <b>{list.length}</b> : null}
                      </span>
                    )}
                  </button>
                </div>
              );
            }
            return (
              // Clicking blank space in a day starts a new event (admin); keyboard users use the day number button.
              <div role="gridcell" key={day.key} className={`evcal-cell${out ? ' is-out' : ''}${isToday ? ' is-today' : ''}`} onClick={mode === 'admin' ? create : undefined}>
                <button type="button" className="evcal-daynum" aria-label={`${full}, ${count}${isToday ? ', today' : ''}${mode === 'admin' ? '. Add event' : '. Show day'}`}
                  onClick={(e) => { e.stopPropagation(); if (mode === 'admin') create(); else goDay(day); }}>{day.d}</button>
                {list.slice(0, 3).map(occ => (
                  <OccLink key={`${occ.key}-${day.key}`} occ={occ} mode={mode} onOpen={onOpen} utc={utc} className={chipClass(occ)}>
                    <span className="evcal-chip-time">{isAllDay(occ) ? '' : clock(occ.startMs, utc)}</span> {occ.event.title}
                  </OccLink>
                ))}
                {list.length > 3 && <button type="button" className="evcal-more" onClick={(e) => { e.stopPropagation(); goDay(day); }}>+{list.length - 3} more</button>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Lay out overlapping timed events side by side.
function layoutLanes(list) {
  const sorted = [...list].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(item => {
      let lane = lanes.findIndex(end => end <= item.top);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = item.bottom;
      item.lane = lane;
    });
    cluster.forEach(item => out.push({ ...item, lanes: lanes.length }));
    cluster = [];
  };
  sorted.forEach(item => {
    if (cluster.length && item.top >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.bottom);
  });
  if (cluster.length) flush();
  return out;
}

function TimeGrid({ days, items, mode, onOpen, onCreate, utc, todayKey, now, goDay, view }) {
  const scroller = useRef(null);
  const [drag, setDrag] = useState(null);
  const cols = days.length;
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX; }, [view]);
  const gridCols = { gridTemplateColumns: `56px repeat(${cols}, minmax(0, 1fr))` };
  const minutesAt = (event, col) => {
    const rect = col.getBoundingClientRect();
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height - 1);
    return Math.floor((y / HOUR_PX) * 60 / SNAP) * SNAP;
  };
  function finish() {
    if (!drag) return;
    const lo = Math.min(drag.a, drag.b);
    const hi = Math.max(drag.a, drag.b) + (drag.a === drag.b ? 60 : SNAP);
    const day = days[drag.col];
    setDrag(null);
    onCreate(makeMs(day.y, day.m, day.d, 0, lo, utc), makeMs(day.y, day.m, day.d, 0, Math.min(hi, 1439 + 1), utc));
  }
  return (
    <div className="evcal-tg">
      <div className="evcal-tg-head" style={gridCols}>
        <div />
        {days.map(day => (
          <button type="button" key={day.key} className={`evcal-tg-day${day.key === todayKey ? ' is-today' : ''}`} onClick={() => goDay(day)} aria-label={`${dayName(day.dow)} ${monthName(day.m)} ${day.d}${day.key === todayKey ? ', today' : ''}. Open day view`}>
            <span>{dayName(day.dow).slice(0, 3)}</span><b>{day.d}</b>
          </button>
        ))}
      </div>
      <div className="evcal-tg-allday" style={gridCols}>
        <div className="evcal-tg-label">All day</div>
        {days.map(day => (
          <div key={day.key} className="evcal-tg-allcell">
            {occurrencesOnDay(items, day).filter(isAllDay).map(occ => (
              <OccLink key={`${occ.key}-${day.key}`} occ={occ} mode={mode} onOpen={onOpen} utc={utc} className={chipClass(occ)}>{occ.event.title}</OccLink>
            ))}
          </div>
        ))}
      </div>
      <div className="evcal-tg-scroll" ref={scroller} tabIndex={0} aria-label="Scrollable time grid">
        <div className="evcal-tg-body" style={{ ...gridCols, height: 24 * HOUR_PX }}>
          <div className="evcal-tg-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR_PX }}>{String(h).padStart(2, '0')}:00</span>)}
          </div>
          {days.map((day, col) => {
            const placed = layoutLanes(occurrencesOnDay(items, day).filter(o => !isAllDay(o)).map(occ => {
              const top = Math.max(0, (occ.startMs - day.startMs) / 60000);
              const bottom = Math.min(1440, Math.max(top + 30, ((occ.endMs ?? occ.startMs) - day.startMs) / 60000));
              return { occ, top, bottom };
            }));
            const nowMin = now >= day.startMs && now < day.endMs ? (now - day.startMs) / 60000 : null;
            return (
              <div key={day.key} className={`evcal-tg-col${day.key === todayKey ? ' is-today' : ''}`} data-day={day.key}
                onPointerDown={mode === 'admin' ? (e) => {
                  if (e.target.closest('.evcal-chip')) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const m = minutesAt(e, e.currentTarget);
                  setDrag({ col, a: m, b: m });
                } : undefined}
                onPointerMove={drag && drag.col === col ? (e) => setDrag({ ...drag, b: minutesAt(e, e.currentTarget) }) : undefined}
                onPointerUp={drag && drag.col === col ? finish : undefined}
                onPointerCancel={() => setDrag(null)}>
                {placed.map(({ occ, top, bottom, lane, lanes }) => (
                  <OccLink key={`${occ.key}-${day.key}`} occ={occ} mode={mode} onOpen={onOpen} utc={utc} className={chipClass(occ, 'evcal-block')}
                    style={{ top: (top / 60) * HOUR_PX, height: Math.max(22, ((bottom - top) / 60) * HOUR_PX - 2), left: `${(lane / lanes) * 100}%`, width: `calc(${100 / lanes}% - 2px)` }}>
                    <b>{clock(occ.startMs, utc)}</b> {occ.event.title}
                  </OccLink>
                ))}
                {drag && drag.col === col && (
                  <div className="evcal-ghost" style={{ top: (Math.min(drag.a, drag.b) / 60) * HOUR_PX, height: ((Math.abs(drag.b - drag.a) + SNAP) / 60) * HOUR_PX }} />
                )}
                {nowMin !== null && <div className="evcal-now" style={{ top: (nowMin / 60) * HOUR_PX }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
      {mode === 'admin' && <p className="evcal-hint">Drag across a day to choose a time range, or click an event to edit it.</p>}
    </div>
  );
}

/**
 * Shared Google-Calendar-style view. mode "member": events link to their guide/detail page.
 * mode "admin": clicking a day / dragging a range calls onCreate(startMs, endMs); clicking an event calls onOpen(occ).
 */
export default function EventCalendar({ events, mode = 'member', defaultUtc = false, views = ['month', 'week'], onCreate, onOpen, toolbarExtra = null, label = 'Event calendar' }) {
  const narrow = useNarrow();
  const [now, setNow] = useState(null);
  const [view, setView] = useState(views[0]);
  const [anchor, setAnchor] = useState(null);
  const [utc, setUtc] = useState(defaultUtc);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const t = Date.now();
    setNow(t);
    setAnchor(t);
    setSelected(dayKey(t, defaultUtc));
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [defaultUtc]);

  const range = useMemo(() => (anchor === null ? null : viewDays(view, anchor, utc)), [view, anchor, utc]);
  const items = useMemo(() => (range ? occurrencesInRange(events, range.from, range.to) : []), [events, range]);
  const zone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'your device'; } }, []);
  if (narrow === null || !range) return <div className="evcal evcal-loading" aria-busy="true">Loading calendar…</div>;

  const todayKey = dayKey(now, utc);
  const mid = tzParts(anchor, utc);
  const go = dir => setAnchor(shiftAnchor(view, anchor, dir, utc));
  const goDay = day => { setAnchor(makeMs(day.y, day.m, day.d, 12, 0, utc)); setView('day'); setSelected(day.key); };
  const create = (startMs, endMs) => onCreate?.(startMs, endMs);
  const selectedDay = range.days.find(day => day.key === selected) || (view === 'month' ? range.days.find(day => day.key === todayKey) : null);
  const title = rangeLabel(view, range.days, utc);

  return (
    <div className={`evcal evcal-${mode}`} role="region" aria-label={label}>
      <div className="evcal-toolbar">
        <div className="evcal-nav">
          <button type="button" onClick={() => go(-1)} aria-label={`Previous ${view}`}>‹</button>
          <button type="button" className="evcal-today" onClick={() => { setAnchor(Date.now()); setSelected(dayKey(Date.now(), utc)); }}>Today</button>
          <button type="button" onClick={() => go(1)} aria-label={`Next ${view}`}>›</button>
        </div>
        <h2 className="evcal-title" aria-live="polite">{title}</h2>
        <div className="evcal-seg" role="group" aria-label="Calendar view">
          {views.map(v => <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>)}
        </div>
        <div className="evcal-seg" role="group" aria-label="Time zone">
          <button type="button" aria-pressed={!utc} onClick={() => setUtc(false)}>Local</button>
          <button type="button" aria-pressed={utc} onClick={() => setUtc(true)}>UTC</button>
        </div>
        {toolbarExtra}
      </div>
      <p className="evcal-zone">Showing {utc ? 'UTC (kingdom time)' : `your local time (${zone})`}. Event times are set in UTC.</p>

      {view === 'month' && (
        <>
          <MonthGrid days={range.days} items={items} mode={mode} onOpen={onOpen} onCreate={create} utc={utc} todayKey={todayKey} anchorMonth={mid.m}
            selected={selected} setSelected={setSelected} narrow={narrow} goDay={goDay} />
          {narrow && selectedDay && <DayList day={selectedDay} items={items} mode={mode} onOpen={onOpen} onCreate={create} utc={utc} today={selectedDay.key === todayKey} />}
        </>
      )}
      {view !== 'month' && narrow && (
        <div className="evcal-agenda">
          {range.days.map(day => <DayList key={day.key} day={day} items={items} mode={mode} onOpen={onOpen} onCreate={create} utc={utc} today={day.key === todayKey} />)}
        </div>
      )}
      {view !== 'month' && !narrow && (
        <TimeGrid days={range.days} items={items} mode={mode} onOpen={onOpen} onCreate={create} utc={utc} todayKey={todayKey} now={now} goDay={goDay} view={view} />
      )}
    </div>
  );
}
