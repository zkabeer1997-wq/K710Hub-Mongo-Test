'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DualTime from '../ui/DualTime';
import { formatCountdown, isDueSoon } from '../../lib/deadlines.mjs';
import styles from './MemberDashboard.module.css';

// Dated events and form deadlines (soonest first) for the dashboard side column.
// Rows due within 48 hours carry a "Due soon" text chip.
export default function DeadlinesPanel({ status, loaded }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const clock = now ?? status?.now ?? 0;
  const entries = (status?.entries || []).filter((e) => e.at > clock);
  return (
    <section className={styles.deadlines} aria-labelledby="deadlines-title">
      <h2 id="deadlines-title">Deadlines</h2>
      {!loaded ? (
        <p className={styles.note} role="status">Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.note}>No dated events or deadlines are scheduled yet.</p>
      ) : (
        <ul className={styles.deadlineList}>
          {entries.map((entry) => {
            const soon = isDueSoon(entry.at, clock);
            return (
              <li key={entry.id} className={styles.deadlineRow} data-soon={soon || undefined}>
                <div className={styles.deadlineTop}>
                  {entry.kind === 'opens'
                    ? <span className={styles.deadlineInfo}>{entry.label}</span>
                    : <Link href={entry.href} prefetch={false}>{entry.label}</Link>}
                  <span className={styles.deadlineCount}>
                    {soon && <b className={styles.dueChip}>Due soon</b>}
                    <span>{formatCountdown(entry.at - clock)}</span>
                  </span>
                </div>
                <div className={styles.deadlineWhen}>
                  <DualTime value={new Date(entry.at).toISOString()} />
                  {entry.estimated && <span> · estimated date, not confirmed</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
