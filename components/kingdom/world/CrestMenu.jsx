'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DESTINATIONS = [
  { href: '/', label: 'Home', note: 'Kingdom 710 website' },
  { href: '/chronometer', label: 'Bear Hunt Schedule', note: 'Alliance times and transfers' },
  { href: '/interest', label: 'Transfer Form', note: 'Apply to join K710' },
  { href: '/player-record', label: 'Member Sign In', note: 'Member pages and forms' },
  { href: '/power-profile', label: 'Gear Tracking', note: 'Gear, heroes, troops, and power' },
  { href: '/admin', label: 'Admin', note: 'Administrators only', restricted: true },
];

/**
 * Restrained crest control. Replaces the conventional nav bar so the
 * world is never framed by browser chrome, while still guaranteeing an
 * escape route from every scene (and keyboard access to all of it).
 */
export default function CrestMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <a href="#main" className="k-skip">Skip to content</a>

      <button
        type="button"
        className="crest-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? 'Close kingdom navigation' : 'Open kingdom navigation'}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <text
            x="20" y="25" textAnchor="middle"
            fontFamily="var(--font-display-loaded), Georgia, serif"
            fontWeight="900" fontSize="12" fill="currentColor"
          >
            710
          </text>
        </svg>
      </button>

      {open && (
        <div className="crest-overlay" role="dialog" aria-modal="true" aria-label="Kingdom navigation">
          <button
            type="button"
            className="crest-overlay-scrim"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <nav className="crest-nav">
            <span className="k-mark crest-nav-head">Kingdom 710</span>
            <ul>
              {DESTINATIONS.map((d) => {
                const active = pathname === d.href;
                return (
                  <li key={d.href}>
                    <Link
                      href={d.href}
                      className={`crest-dest ${d.restricted ? 'is-restricted' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      data-active={active}
                    >
                      <span className="k-display crest-dest-label">{d.label}</span>
                      <span className="k-narrative crest-dest-note">{d.note}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
