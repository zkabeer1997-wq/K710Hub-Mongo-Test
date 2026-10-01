'use client';

import { useEffect, useState } from 'react';
import { formatUtc } from '../../lib/deadlines.mjs';

// One instant shown as local time + UTC. The server render (and no-JS) shows
// UTC only, so there is no hydration mismatch; once mounted it upgrades to
// "Oct 5, 7:00 PM (Oct 5, 14:00 UTC)" in the viewer's time zone.
export default function DualTime({ value, className = '' }) {
  const [local, setLocal] = useState('');
  useEffect(() => {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return;
    try {
      setLocal(new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)));
    } catch { /* keep UTC only */ }
  }, [value]);
  const utc = formatUtc(value);
  if (!utc) return null;
  return (
    <time dateTime={new Date(Date.parse(value)).toISOString()} className={className}>
      {local ? `${local} local (${utc})` : utc}
    </time>
  );
}
