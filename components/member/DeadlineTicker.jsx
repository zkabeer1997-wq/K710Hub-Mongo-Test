'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import { useEffect, useState } from 'react';
import Icon from '../ui/icons';
import './deadline-ticker.css';
import { formatCountdown, formatUtc, isDueSoon } from '../../lib/deadlines.mjs';

// Thin bar under the header: the next 2-3 dated events/deadlines as live
// countdowns. Hidden entirely when there is nothing dated. Dates that come from
// the built-in default schedule are marked "est." - nothing here is official
// until an admin publishes the event. aria-live is off: counts update visually.
export default function DeadlineTicker() {
  const [items, setItems] = useState(null);
  const [now, setNow] = useState(null);
  const pathname = usePathname();
  const { status, loaded } = useMemberFormStatus('ticker');
  // The sign-in card (and /dashboard while signed out) is a gate: on phones the
  // ticker would push the Player ID box down, so CSS hides it there.
  const onGate = pathname === '/login' || (pathname === '/dashboard' && !(loaded && status.signedIn));

  useEffect(() => {
    let alive = true;
    fetch('/api/deadlines', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => { if (alive) setItems(Array.isArray(data.items) ? data.items : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!items || items.length === 0) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [items]);

  if (!items || items.length === 0 || now === null) return null;
  const live = items.filter((item) => item.at > now);
  if (live.length === 0) return null;

  return (
    <aside className={`deadline-ticker${onGate ? ' deadline-ticker--gate' : ''}`} aria-label="Upcoming dates" aria-live="off">
      <ul className="deadline-ticker-list">
        {live.map((item) => {
          const remaining = item.at - now;
          const soon = isDueSoon(item.at, now);
          return (
            <li key={item.id} className={`deadline-ticker-item${soon ? ' is-soon' : ''}`}>
              <Icon name={item.kind === 'deadline' ? 'alert' : 'clock'} size={14} />
              <Link href={item.href} prefetch={false} title={`${formatUtc(item.at)}${item.estimated ? ' - estimated, not confirmed by leadership' : ''}`}>
                <span className="deadline-ticker-label">{item.label}{item.estimated ? ' (est.)' : ''}</span>
                <b className="deadline-ticker-count">{formatCountdown(remaining, { seconds: true })}</b>
                {soon && <span className="deadline-ticker-flag">Due soon</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
