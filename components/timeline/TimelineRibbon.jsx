'use client';

import { useEffect, useState } from 'react';
import DualTime from '../ui/DualTime';
import { chapterStatus, formatRemaining, kingdomDay, locate, phaseProgress, timeAgo } from '../../lib/external/timelineProgress.mjs';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const STATUS_LABEL = { done: 'Done', current: 'In progress', upcoming: 'Upcoming' };

/** Ticks `now` every `everyMs`. Starts at the server's clock so hydration matches. */
export function useNow(serverNow, everyMs = 30_000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function DaySeal({ createdDate, serverNow, kingdom = 710 }) {
  const now = useNow(serverNow, 60_000);
  const day = kingdomDay(createdDate, now);
  return (
    <div className="tl-seal" aria-label={day ? `Day ${day} of kingdom ${kingdom}` : `Kingdom ${kingdom}`}>
      {day ? (
        <>
          <small>DAY</small>
          <strong>{day}</strong>
          <small>OF THE KINGDOM</small>
        </>
      ) : (
        <strong>{kingdom}</strong>
      )}
    </div>
  );
}

export function UpdatedAgo({ iso, serverNow }) {
  const now = useNow(serverNow, 60_000);
  return <time dateTime={iso}>{timeAgo(iso, now)}</time>;
}

function Chapter({ chapter, status, nextChapter, now }) {
  const [y, m, d] = chapter.date.split('-');
  const progress = status === 'current' && nextChapter ? phaseProgress(chapter.startMs, nextChapter.startMs, now) : null;
  const pct = progress === null ? null : Math.round(progress * 100);
  return (
    <li className={`tl-chapter tl-${status}`} aria-current={status === 'current' ? 'step' : undefined}>
      <div className="tl-marker" aria-hidden="true">
        <b>{Number(d)}</b>
        <span>{MONTHS[Number(m) - 1]}</span>
        <i>{y}</i>
      </div>
      <div className="tl-body">
        <p className="tl-meta">
          <span className={`tl-status tl-status-${status}`}>{STATUS_LABEL[status]}</span>
          <DualTime value={`${chapter.date}T00:00:00Z`} className="tl-time" />
          {status === 'upcoming' && <span className="tl-in">in {formatRemaining(chapter.startMs - now)}</span>}
        </p>
        <ul className="tl-items">
          {chapter.items.map((item) => (
            <li key={item.slug}>
              <h3>{item.title}</h3>
              <span className="tl-cat">{item.category}</span>
              {item.notes && <p>{item.notes}</p>}
            </li>
          ))}
        </ul>
        {pct !== null && (
          <div className="tl-progress">
            <div
              className="tl-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Progress to the next milestone"
            >
              <span style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <p>
              <strong>{pct}%</strong> of the way to the next unlock ({nextChapter.items[0].title}
              {nextChapter.items.length > 1 ? ` +${nextChapter.items.length - 1}` : ''}) · {formatRemaining(nextChapter.startMs - now)} left
            </p>
          </div>
        )}
        {status === 'current' && !nextChapter && <p className="tl-note">This is the latest milestone published so far.</p>}
      </div>
    </li>
  );
}

export default function TimelineRibbon({ chapters, serverNow }) {
  const now = useNow(serverNow);
  const { currentIndex } = locate(chapters, now);
  const past = chapters.filter((c) => c.index < currentIndex);
  const ahead = chapters.filter((c) => c.index >= currentIndex);
  const render = (c) => (
    <Chapter key={c.date} chapter={c} status={chapterStatus(c.index, currentIndex)} nextChapter={chapters[c.index + 1]} now={now} />
  );
  return (
    <div className="tl-wrap">
      {past.length > 0 && (
        <details className="tl-past">
          <summary>Earlier chapters ({past.length})</summary>
          <ol className="tl-ribbon" aria-label="Completed milestones">{past.map(render)}</ol>
        </details>
      )}
      <ol className="tl-ribbon" aria-label="Current and upcoming milestones">{ahead.map(render)}</ol>
    </div>
  );
}
