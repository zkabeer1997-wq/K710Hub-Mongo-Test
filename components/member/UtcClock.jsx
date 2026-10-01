'use client';

import { useEffect, useState } from 'react';
import { formatClockUtc } from '../../lib/deadlines.mjs';

// Live UTC game clock. Updates visually every second; deliberately not an
// aria-live region (a screen reader would announce every tick), so it is a
// plain <time> with a stable accessible name. Renders empty until mounted.
export default function UtcClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="utc-clock" aria-label="Current server time in UTC" aria-live="off" suppressHydrationWarning>
      {now ? formatClockUtc(now) : '--:--:-- UTC'}
    </time>
  );
}
