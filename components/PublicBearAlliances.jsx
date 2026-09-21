'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBearSchedule } from './BearScheduleProvider';
import { bearTimeLabel } from '../lib/localTime';

export default function PublicBearAlliances({ layout = 'home', initialAlliances = null, notes = {} }) {
  // Server render shows UTC; once mounted we upgrade to the viewer's local
  // time (UTC kept in parentheses). Guarding on `mounted` keeps the first
  // client render identical to the server's, avoiding a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { alliances, loading, error } = useBearSchedule(initialAlliances);
  if (loading) return <p>Loading alliance schedules…</p>;
  if (error) return <p role="status">{error}</p>;
  if (!alliances.length) return <p>No alliance schedules are currently published.</p>;
  if (layout === 'chamber') return (
    <div className="standards">
      {alliances.map(alliance => (
        <article key={alliance.tag} className="standard k-wb" data-band={alliance.tag}>
          <div className="standard-cloth" aria-hidden="true" />
          <span className="standard-gem" aria-hidden="true" />
          <span className="k-mark standard-role">{alliance.bear_times_utc.length} daily Bear Hunt {alliance.bear_times_utc.length === 1 ? 'time' : 'times'}</span>
          <h3 className="k-display standard-name">{alliance.name}</h3>
          {notes[alliance.tag] && <p className="k-narrative standard-desc">{notes[alliance.tag]}</p>}
          <ul className="standard-windows">
            {alliance.bear_times_utc.map(time => <li key={time}><span className="k-gem" aria-hidden="true" /><span className="k-mark">{time} UTC</span></li>)}
          </ul>
          {!alliance.bear_times_utc.length && <p>No Bear Hunt times set.</p>}
        </article>
      ))}
    </div>
  );
  return (
    <div className="home-v2-alliance-line">
      {alliances.map((alliance, index) => (
        <div className="home-v2-alliance-fragment" key={alliance.tag}>
          {index > 0 && <i />}
          <Link href={`/alliances/${alliance.tag.toLowerCase()}`}>
            <b>{alliance.tag}</b><small>{alliance.name}</small>
            <em>{alliance.bear_times_utc.length ? alliance.bear_times_utc.map(time => bearTimeLabel(time, { mounted })).join(' · ') : 'No Bear Hunt times set.'}{notes[alliance.tag] ? `\n\n${notes[alliance.tag]}` : ''}</em>
          </Link>
        </div>
      ))}
    </div>
  );
}
