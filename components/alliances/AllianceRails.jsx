'use client';

// Side rails of the alliance page (shown from 1280px wide, after the main content in the DOM):
//   left  - other alliances (switcher) and "On this page" links with a lightweight scrollspy
//   right - next Bear Hunt countdown, the kingdom's KvK record and the Apply button
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useBearSchedule } from '../BearScheduleProvider';
import { useT } from '../i18n/LanguageProvider';
import { bandProps } from '../../lib/alliances.mjs';
import { RAIL_ANCHORS, formatCountdown, nextHuntCountdown, pickActiveAnchor, railChips } from '../../lib/allianceRails.mjs';
import { utcHmToLocal } from '../../lib/localTime';
import './alliances.css';

function Switcher({ alliances, currentTag }) {
  const t = useT();
  const chips = railChips(alliances, currentTag);
  if (chips.length < 2) return null;
  return (
    <nav className="al-rail-card" aria-labelledby="al-rail-others-h">
      <h2 id="al-rail-others-h" className="al-rail-h">{t('alliances.rail.others')}</h2>
      <ul className="al-chips">
        {chips.map((c) => (
          <li key={c.tag}>
            <Link
              className="al-navchip k-wb" {...bandProps(c.tag)} href={c.href}
              aria-current={c.current ? 'page' : undefined} aria-label={`${c.name} (${c.tag})`}
            >
              <span className="al-gem" aria-hidden="true" />{c.tag}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SectionNav() {
  const t = useT();
  const [active, setActive] = useState(RAIL_ANCHORS[0].id);
  const locked = useRef('');
  useEffect(() => {
    const els = RAIL_ANCHORS.map((a) => document.getElementById(a.id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Set();
    // A band just under the sticky site header: a section is "current" while it overlaps that band.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); }
      if (locked.current && !visible.has(locked.current)) locked.current = '';
      setActive((prev) => pickActiveAnchor(visible, RAIL_ANCHORS, prev, locked.current));
    }, { rootMargin: '-140px 0px -50% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="al-rail-card" aria-labelledby="al-rail-page-h">
      <h2 id="al-rail-page-h" className="al-rail-h">{t('alliances.rail.onPage')}</h2>
      <ul className="al-anchors">
        {RAIL_ANCHORS.map((a) => (
          <li key={a.id}>
            <a
              href={`#${a.id}`} aria-current={active === a.id ? 'location' : undefined}
              onClick={() => { locked.current = a.id; setActive(a.id); }}
            >{t(a.labelKey)}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LeftRail({ alliances, currentTag }) {
  return (
    <aside className="al-rail al-rail-left">
      <Switcher alliances={alliances} currentTag={currentTag} />
      <SectionNav />
    </aside>
  );
}

function NextHunt({ tag, initialTimes }) {
  const t = useT();
  const { alliances } = useBearSchedule(initialTimes ? [{ tag, bear_times_utc: initialTimes }] : null);
  const times = alliances.find((a) => a.tag === tag)?.bear_times_utc || [];
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Before mount `now` is 0 so the server and the first client render agree; the clock starts after hydration.
  const next = nextHuntCountdown(times, now ?? 0);
  if (!next) return null;
  const local = now === null ? '' : utcHmToLocal(next.time);
  return (
    <div className="al-rail-card">
      <p className="al-label">{t('alliances.rail.nextHunt')}</p>
      {/* The ticking numbers are decorative: the line below is the stable, accessible statement (no live region). */}
      <div className="al-count" aria-hidden="true">{now === null ? '--:--:--' : formatCountdown(next.ms)}</div>
      <p className="al-count-line">
        {t('alliances.rail.nextLine', { n: next.index + 1, utc: next.time })}
        {local ? <span className="al-count-local">{t('alliances.rail.local', { time: local })}</span> : null}
      </p>
    </div>
  );
}

function KvkCard({ kvk }) {
  const t = useT();
  if (!kvk) return null;
  return (
    <div className="al-rail-card">
      <p className="al-label">{t('alliances.rail.kvk')}</p>
      <div className="al-record">
        <span className="al-record-w">{kvk.wins}</span>
        <span aria-hidden="true">–</span>
        <span className="al-record-l">{kvk.losses}</span>
        <span className="al-sr"> {t('alliances.rail.kvkWins')}</span>
      </div>
      <p className="al-count-line">{kvk.stale ? t('alliances.rail.lastKnown') : t('alliances.rail.updated')}</p>
    </div>
  );
}

export function RightRail({ tag, bearTimes, kvk }) {
  const t = useT();
  return (
    <aside className="al-rail al-rail-right">
      <NextHunt tag={tag} initialTimes={bearTimes} />
      <KvkCard kvk={kvk} />
      <Link href="/interest" className="al-cta">{t('alliances.rail.apply')}</Link>
    </aside>
  );
}
