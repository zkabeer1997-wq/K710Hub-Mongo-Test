'use client';

import { useEffect, useState } from 'react';
import { useBearSchedule } from '../../components/BearScheduleProvider';
import { bandProps } from '../../lib/alliances.mjs';
import { toMinutes } from '../../lib/bearHuntSchedule.js';

// The Bear Hunt windows grouped by alliance (members look for "my alliance, my time"), each
// alliance's hunts in the order they happen in the VIEWER's day. The server render shows UTC so
// there is real content before hydration; once mounted, each hunt shows local time first with
// UTC underneath. No table: on a phone a three-column table cut off the UTC column.
function localParts(utc) {
  const [h, m] = utc.split(':').map(Number);
  const today = new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h, m));
  return {
    label: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

export default function BearHuntSchedule({ initialAlliances = null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { alliances, hunts, loading, error } = useBearSchedule(initialAlliances);
  if (loading) return <p>Loading Bear Hunt times…</p>;
  if (error) return <p role="status">{error}</p>;
  if (!hunts.length) return <p>No Bear Hunt times are currently published.</p>;

  // Alliance order follows the alliance list; any tag missing from it goes last.
  const order = alliances.map((a) => a.tag);
  const tags = [...new Set(hunts.map((h) => h.band))].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="events-hunts">
      <ul className="events-hunts-groups">
        {tags.map((tag) => {
          const rows = hunts.filter((h) => h.band === tag).map((h) => {
            const local = mounted ? localParts(h.utc) : null;
            return { utc: h.utc, local, sortKey: local ? local.minutes : toMinutes(h.utc) };
          }).sort((a, b) => a.sortKey - b.sortKey);
          return (
            <li key={tag} className="events-hunts-group">
              <span className="ui-tag k-wb events-hunts-tag" {...bandProps(tag)}>{tag}</span>
              <ul className="events-hunts-times" aria-label={`${tag} Bear Hunt times`}>
                {rows.map((row) => (
                  <li key={row.utc}>
                    {row.local ? (
                      <>
                        <strong className="events-hunts-local">{row.local.label}</strong>
                        <span className="events-hunts-utc">{row.utc} UTC</span>
                      </>
                    ) : (
                      <strong className="events-hunts-local">{row.utc} UTC</strong>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {mounted ? <p className="events-hunts-note">Times shown in your device’s time zone.</p> : null}
      <div className="events-ics">
        <a href="/api/events/bear-hunt.ics" className="events-ics-link" download>
          📅 Add Bear Hunt times to my calendar
        </a>
        <p className="events-ics-hint">
          Saves a calendar file you can open in Google Calendar, Apple Calendar, or Outlook.
        </p>
      </div>
    </div>
  );
}
