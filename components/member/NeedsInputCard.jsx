'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon from '../ui/icons';
import DualTime from '../ui/DualTime';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';
import { formatCountdown, isDueSoon } from '../../lib/deadlines.mjs';

// Dashboard "Needs your input": dated list (soonest first), rows due within 48h
// flagged with a "Due soon" text badge (not colour alone), deadlines due today
// spelled out in hours and minutes, a summary of what is still open and one
// button that jumps to the first incomplete form.
export default function NeedsInputCard() {
  const { status, loaded } = useMemberFormStatus();
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!loaded || !status.signedIn) return null;
  const clock = now ?? status.now ?? 0;
  const entries = (status.entries || []).filter((e) => e.at > clock);

  return (
    <section className="needs-card" aria-labelledby="needs-input-title">
      <div className="needs-head">
        <div>
          <h2 id="needs-input-title">Needs your input</h2>
          <p className="needs-summary">{status.summary || 'You are up to date. Nothing is waiting on you right now.'}</p>
        </div>
        {status.firstIncomplete && (
          <Link href={status.firstIncomplete.href} className="k-btn k-btn-primary needs-cta">
            Get started <Icon name="arrow" size={16} />
          </Link>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="needs-empty">No dated events or deadlines are scheduled yet.</p>
      ) : (
        <ul className="needs-list">
          {entries.map((entry) => {
            const remaining = entry.at - clock;
            const soon = isDueSoon(entry.at, clock);
            const iso = new Date(entry.at).toISOString();
            return (
              <li key={entry.id} className={`needs-row${soon ? ' is-soon' : ''}`}>
                <div>
                  <Link href={entry.href}>{entry.label}</Link>
                  <div className="needs-when"><DualTime value={iso} />{entry.estimated && <span className="needs-est"> · estimated date, not confirmed</span>}</div>
                </div>
                <div className="needs-count">
                  {soon && <span className="needs-flag">Due soon</span>}
                  <span>{formatCountdown(remaining)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
