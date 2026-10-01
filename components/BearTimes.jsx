'use client';

import { useEffect, useState } from 'react';
import { nextBearTime, validateBearTimes } from '../lib/bearHuntSchedule';
import { utcHmToLocal } from '../lib/localTime';

/**
 * One presentation of an alliance's daily Bear Hunt times, used on the home
 * page, About and alliance pages. Local time first, UTC second, and the next
 * upcoming time highlighted. Server render shows UTC only (no highlight) so
 * the first client render matches; it upgrades once mounted.
 */
export default function BearTimes({ times, emptyLabel = 'No Bear Hunt times set.', className = '' }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const { times: sorted } = validateBearTimes(Array.isArray(times) ? times : []);
  if (!sorted || !sorted.length) return <span className="bear-times-empty">{emptyLabel}</span>;
  const next = now === null ? null : nextBearTime(sorted, now);
  return (
    <span className={`bear-times ${className}`.trim()} role="list">
      {sorted.map(time => {
        const local = now === null ? null : utcHmToLocal(time);
        const isNext = time === next;
        return (
          <span role="listitem" key={time} className="bear-time" data-next={isNext ? 'true' : undefined}>
            <time className="bear-time-main">{local || `${time} UTC`}</time>
            {local && <span className="bear-time-utc">{time} UTC</span>}
            {isNext && <span className="bear-time-flag">Next</span>}
          </span>
        );
      })}
    </span>
  );
}
